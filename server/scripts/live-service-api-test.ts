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
			finalState: Record<string, unknown> | null;
			snapshotHash: string | null;
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

	const ackInput = {
		objectKey: upload.objectKey,
		idempotencyKey: `live-ack-${crypto.randomUUID()}`,
	};
	const ack = await requestJSON<{
		documentId: string;
		presignedUploadId: string;
	}>(config, "/service/uploads/ack", {
		method: "POST",
		body: JSON.stringify(ackInput),
	});
	const retriedAck = await requestJSON<typeof ack>(
		config,
		"/service/uploads/ack",
		{
			method: "POST",
			body: JSON.stringify(ackInput),
		},
	);
	if (
		retriedAck.documentId !== ack.documentId ||
		retriedAck.presignedUploadId !== ack.presignedUploadId
	) {
		throw new Error("Upload acknowledgement retry returned a new result");
	}
	const ackConflict = await fetch(`${config.apiBaseUrl}/service/uploads/ack`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": config.apiKey,
		},
		body: JSON.stringify({
			...ackInput,
			objectKey: `${upload.objectKey}-conflict`,
		}),
	});
	if (ackConflict.status !== 409) {
		throw new Error(
			`Conflicting upload acknowledgement returned ${ackConflict.status}, expected 409`,
		);
	}
	console.log(`Acknowledged document ${ack.documentId}`);

	const executionInput = {
		workflowId: config.workflowId,
		documentIds: [ack.documentId],
		idempotencyKey: `live-execution-${crypto.randomUUID()}`,
		initialState: {
			analysis_label: "live-service-api-test",
			source: "local-smoke",
			requested_at: new Date().toISOString(),
			tags: ["smoke", "service-api"],
		},
	};
	const execution = await requestJSON<{ executionId: string }>(
		config,
		"/service/workflow-executions",
		{
			method: "POST",
			body: JSON.stringify(executionInput),
		},
	);
	const retriedExecution = await requestJSON<{ executionId: string }>(
		config,
		"/service/workflow-executions",
		{
			method: "POST",
			body: JSON.stringify(executionInput),
		},
	);
	if (retriedExecution.executionId !== execution.executionId) {
		throw new Error("Workflow execution retry returned a new execution");
	}
	const executionConflict = await fetch(
		`${config.apiBaseUrl}/service/workflow-executions`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": config.apiKey,
			},
			body: JSON.stringify({
				...executionInput,
				initialState: {
					...executionInput.initialState,
					analysis_label: "conflicting-live-service-api-test",
				},
			}),
		},
	);
	if (executionConflict.status !== 409) {
		throw new Error(
			`Conflicting workflow execution returned ${executionConflict.status}, expected 409`,
		);
	}
	console.log(`Queued execution ${execution.executionId}`);

	const completedExecution = await waitForExecution(
		config,
		execution.executionId,
	);
	console.log(`Execution ${execution.executionId} completed`);
	if (!/^[0-9a-f]{64}$/.test(completedExecution.snapshotHash ?? "")) {
		throw new Error("The workflow execution did not expose a snapshot hash");
	}
	const findingSummary = completedExecution.finalState?.finding_summary;
	if (typeof findingSummary !== "string") {
		throw new Error("The workflow completed without a finding summary");
	}
	const parsedFinding = JSON.parse(findingSummary) as unknown;
	if (
		!parsedFinding ||
		typeof parsedFinding !== "object" ||
		Array.isArray(parsedFinding)
	) {
		throw new Error("The workflow finding summary was not a JSON object");
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
	if (publicDocument.publicUrl) {
		console.log(`Public URL: ${publicDocument.publicUrl}`);
	}
}

await main();
