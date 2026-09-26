import { afterEach, describe, expect, test } from "bun:test";
import { assertLocalOnlySettings } from "./localOnlySettings";

const original = {
	debug: process.env.API_DEBUG,
	privateWebhooks: process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS,
};

function setSwitches(debug?: string, privateWebhooks?: string) {
	for (const [name, value] of [
		["API_DEBUG", debug],
		["WEBHOOK_ALLOW_PRIVATE_DESTINATIONS", privateWebhooks],
	] as const) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
}

afterEach(() => setSwitches(original.debug, original.privateWebhooks));

describe("assertLocalOnlySettings", () => {
	test("allows local switches on a local http base URL", () => {
		setSwitches("true", "true");
		for (const baseURL of [
			"http://localhost:3000",
			"http://api.localhost:3000",
			"http://127.0.0.1:13000",
			"http://[::1]:3000",
		]) {
			expect(() => assertLocalOnlySettings(baseURL)).not.toThrow();
		}
	});

	test("refuses debug mode on a deployed base URL", () => {
		setSwitches("true", undefined);
		for (const baseURL of [
			"https://api.example.com",
			"https://localhost:3000",
			"http://api.example.com",
			"http://10.0.0.5:3000",
		]) {
			expect(() => assertLocalOnlySettings(baseURL)).toThrow("API_DEBUG");
		}
	});

	test("refuses private webhook destinations on a deployed base URL", () => {
		setSwitches(undefined, "true");
		expect(() => assertLocalOnlySettings("https://api.example.com")).toThrow(
			"WEBHOOK_ALLOW_PRIVATE_DESTINATIONS",
		);
	});

	test("does nothing when both switches are off", () => {
		setSwitches("false", undefined);
		expect(() =>
			assertLocalOnlySettings("https://api.example.com"),
		).not.toThrow();
	});
});
