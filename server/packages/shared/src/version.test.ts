import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { VISION_VERSION } from "./version";

test("the Go services report the same release version", async () => {
	expect(VISION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	for (const [file, constant] of [
		["../../../../models/mcp/server/start_server.go", "mcpServerVersion"],
		["../../../../models/agents/clients/mcp.go", "mcpClientVersion"],
	]) {
		const source = await readFile(new URL(file, import.meta.url), "utf8");
		expect(source).toContain(`const ${constant} = "${VISION_VERSION}"`);
	}
});
