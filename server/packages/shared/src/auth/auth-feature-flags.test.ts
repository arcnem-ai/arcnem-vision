import { afterEach, describe, expect, test } from "bun:test";
import { getAuthFeatureFlags } from "./auth-feature-flags";

const original = {
	signUp: process.env.AUTH_ENABLE_SIGN_UP,
	organizationCreation: process.env.AUTH_ENABLE_ORGANIZATION_CREATION,
};

function setFlags(signUp?: string, organizationCreation?: string) {
	for (const [name, value] of [
		["AUTH_ENABLE_SIGN_UP", signUp],
		["AUTH_ENABLE_ORGANIZATION_CREATION", organizationCreation],
	] as const) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
}

afterEach(() => setFlags(original.signUp, original.organizationCreation));

describe("getAuthFeatureFlags", () => {
	test("reads explicit true and false values", () => {
		setFlags("false", "true");
		expect(getAuthFeatureFlags()).toEqual({
			signUpEnabled: false,
			organizationCreationEnabled: true,
		});
	});

	test("requires each flag instead of defaulting to open sign-up", () => {
		setFlags(undefined, "false");
		expect(() => getAuthFeatureFlags()).toThrow("AUTH_ENABLE_SIGN_UP");
		setFlags("false", "");
		expect(() => getAuthFeatureFlags()).toThrow(
			"AUTH_ENABLE_ORGANIZATION_CREATION",
		);
		setFlags("yes", "false");
		expect(() => getAuthFeatureFlags()).toThrow("AUTH_ENABLE_SIGN_UP");
	});
});
