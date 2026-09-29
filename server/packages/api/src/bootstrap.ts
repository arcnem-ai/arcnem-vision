import { getDB } from "@arcnem-vision/db/server";
import { bootstrapInstallation } from "@/lib/installation-bootstrap";

// `bun run bootstrap`: prepares a fresh deployment after migrations. Requires
// BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_ORGANIZATION_NAME.
function required(name: string) {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const ownerEmail = required("BOOTSTRAP_OWNER_EMAIL");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
	throw new Error("BOOTSTRAP_OWNER_EMAIL must be an email address");
}

const result = await bootstrapInstallation(getDB(), {
	ownerEmail,
	organizationName: required("BOOTSTRAP_ORGANIZATION_NAME"),
});
console.log(
	result.ownerCreated
		? `Created owner ${ownerEmail}.`
		: `Owner ${ownerEmail} already exists.`,
);
if (result.organizationCreated) {
	console.log(`Created their organization ${result.organizationId}.`);
}
if (result.starterWorkflowId) {
	console.log(`Created the starter workflow ${result.starterWorkflowId}.`);
}
process.exit(0);
