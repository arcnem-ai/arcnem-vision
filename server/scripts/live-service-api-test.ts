export {};

const DEFAULT_IMAGE_PATH = new URL(
	"./fixtures/mountain-vista.jpg",
	import.meta.url,
).pathname;

type ServiceConfig = {
	apiBaseUrl: string;
	apiKey: string;
	workflowId: string;
	imagePath: string;
	publicBaseUrl: string;
};

function trimTrailingSlash(value: string) {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function requiredEnv(name: string) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

async function readConfig(): Promise<ServiceConfig> {
	return {
		apiBaseUrl: trimTrailingSlash(requiredEnv("SERVICE_API_URL")),
		apiKey: requiredEnv("SERVICE_API_KEY"),
		workflowId: requiredEnv("SERVICE_WORKFLOW_ID"),
		imagePath: DEFAULT_IMAGE_PATH,
		publicBaseUrl: trimTrailingSlash(requiredEnv("S3_PUBLIC_BASE_URL")),
	};
}

async function requestJSON<T>(
	config: ServiceConfig,
	path: string,
	init: RequestInit,
): Promise<T> {
	const response = await fetch(`${config.apiBaseUrl}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			"x-api-key": config.apiKey,
			...(init.headers ?? {}),
		},
	});

	if (!response.ok) {
		throw new Error(
			`Request to ${path} failed with status ${response.status}: ${await response.text()}`,
		);
	}

	return (await response.json()) as T;
}

async function waitForExecution(config: ServiceConfig, executionId: string) {
	const startedAt = Date.now();
	const timeoutMs = 3 * 60 * 1000;

	while (Date.now() - startedAt < timeoutMs) {
		const execution = await requestJSON<{
			status: string;
			error: string | null;
		}>(config, `/service/workflow-executions/${executionId}`, {
			method: "GET",
		});

		if (execution.status === "completed") {
			return execution;
		}

		if (execution.status === "failed" || execution.status === "cancelled") {
			throw new Error(
				execution.error ??
					`Execution ${executionId} entered terminal state ${execution.status}`,
			);
		}

		await Bun.sleep(3_000);
	}

	throw new Error(`Timed out waiting for workflow execution ${executionId}`);
}

async function main() {
	const config = await readConfig();
	const image = Bun.file(config.imagePath);
	if (!(await image.exists())) {
		throw new Error(`Image fixture not found: ${config.imagePath}`);
	}

	const contentType = image.type || "image/jpeg";
	const bytes = new Uint8Array(await image.arrayBuffer());

	console.log(`Using workflow ${config.workflowId}`);
	console.log(`Uploading ${config.imagePath} (${bytes.byteLength} bytes)`);

	const upload = await requestJSON<{
		objectKey: string;
		uploadUrl: string;
	}>(config, "/service/uploads/presign", {
		method: "POST",
		body: JSON.stringify({
			contentType,
			size: bytes.byteLength,
		}),
	});

	const putResponse = await fetch(upload.uploadUrl, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: bytes,
	});
	if (!putResponse.ok) {
		throw new Error(`Upload PUT failed with status ${putResponse.status}`);
	}

	const ack = await requestJSON<{ documentId: string }>(
		config,
		"/service/uploads/ack",
		{
			method: "POST",
			body: JSON.stringify({ objectKey: upload.objectKey }),
		},
	);
	console.log(`Acknowledged document ${ack.documentId}`);

	const execution = await requestJSON<{ executionId: string }>(
		config,
		"/service/workflow-executions",
		{
			method: "POST",
			body: JSON.stringify({
				workflowId: config.workflowId,
				documentIds: [ack.documentId],
				initialState: {
					analysis_label: "live-service-api-test",
					source: "local-smoke",
					requested_at: new Date().toISOString(),
					tags: ["smoke", "service-api"],
				},
			}),
		},
	);
	console.log(`Queued execution ${execution.executionId}`);

	await waitForExecution(config, execution.executionId);
	console.log(`Execution ${execution.executionId} completed`);

	const document = await requestJSON<{
		description: string | null;
		publicUrl: string | null;
	}>(config, `/service/documents/${ack.documentId}`, {
		method: "GET",
	});
	if (!document.description) {
		throw new Error(
			"The workflow completed without saving a document description",
		);
	}

	await requestJSON(config, "/service/documents/visibility", {
		method: "POST",
		body: JSON.stringify({
			documentIds: [ack.documentId],
			visibility: "public",
		}),
	});

	const publicDocument = await requestJSON<{
		visibility: string;
		publicUrl: string | null;
	}>(config, `/service/documents/${ack.documentId}`, {
		method: "GET",
	});
	if (publicDocument.visibility !== "public") {
		throw new Error("Document visibility update did not persist");
	}
	if (!publicDocument.publicUrl) {
		throw new Error(
			"Document visibility was updated to public but no publicUrl was returned",
		);
	}
	if (!publicDocument.publicUrl.startsWith(`${config.publicBaseUrl}/`)) {
		throw new Error(
			`Document publicUrl ${publicDocument.publicUrl} did not use the configured public base ${config.publicBaseUrl}`,
		);
	}
	const publicResponse = await fetch(publicDocument.publicUrl, {
		method: "GET",
	});
	if (!publicResponse.ok) {
		throw new Error(
			`Document publicUrl ${publicDocument.publicUrl} was not anonymously readable (status ${publicResponse.status})`,
		);
	}
	const publicContentType = publicResponse.headers.get("content-type");
	if (!publicContentType?.startsWith("image/")) {
		throw new Error(
			`Document publicUrl ${publicDocument.publicUrl} returned unexpected content type ${publicContentType ?? "unknown"}`,
		);
	}

	console.log("Live service API test passed");
	console.log(`Document description: ${document.description}`);
	if (publicDocument.publicUrl) {
		console.log(`Public URL: ${publicDocument.publicUrl}`);
	}
}

await main();
