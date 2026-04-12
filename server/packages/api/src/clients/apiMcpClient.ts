import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";

export class ApiMcpClient {
	private readonly client = new Client(
		{
			name: "arcnem-vision-api",
			version: "1.0.0",
		},
		{
			capabilities: {},
		},
	);

	private transport: StreamableHTTPClientTransport | undefined;

	private connected = false;

	private getTransport() {
		this.transport ??= new StreamableHTTPClientTransport(
			new URL(getAPIEnvVar(API_ENV_VAR.MCP_SERVER_URL)),
		);

		return this.transport;
	}

	async connect() {
		if (this.connected) {
			return;
		}

		await this.client.connect(this.getTransport());
		this.connected = true;
	}

	async callTool<TOutput>(
		name: string,
		args: Record<string, unknown>,
	): Promise<TOutput> {
		await this.connect();

		const result = await this.client.callTool({
			name,
			arguments: args,
		});

		const content = (result as { content?: unknown }).content;
		if (!Array.isArray(content)) {
			throw new Error(`MCP tool ${name} returned no content payload.`);
		}

		const textContent = content.find(
			(item): item is { type: "text"; text: string } =>
				typeof item === "object" &&
				item !== null &&
				"type" in item &&
				item.type === "text" &&
				"text" in item &&
				typeof item.text === "string",
		);

		if (!textContent) {
			throw new Error(`MCP tool ${name} returned no text content.`);
		}

		try {
			return JSON.parse(textContent.text) as TOutput;
		} catch (error) {
			throw new Error(
				error instanceof Error
					? `MCP tool ${name} returned invalid JSON: ${error.message}`
					: `MCP tool ${name} returned invalid JSON.`,
			);
		}
	}

	async close() {
		if (!this.connected || !this.transport) {
			return;
		}

		await this.transport.close();
		this.connected = false;
	}
}

let cachedApiMcpClient: ApiMcpClient | undefined;

export function getApiMcpClient() {
	cachedApiMcpClient ??= new ApiMcpClient();
	return cachedApiMcpClient;
}
