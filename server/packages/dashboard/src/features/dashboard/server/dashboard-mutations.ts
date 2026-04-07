export { assignWorkflowToDevice } from "./device-workflow-mutation";
export {
	createOrganization,
	switchActiveOrganization,
} from "./organization-management-mutations";
export {
	createDevice,
	createDeviceAPIKey,
	createProject,
	deleteDeviceAPIKey,
	setDeviceArchived,
	setProjectArchived,
	updateDevice,
	updateDeviceAPIKey,
} from "./project-management-mutations";
export {
	createWorkflow,
	createWorkflowFromTemplate,
	createWorkflowTemplateFromWorkflow,
	updateWorkflow,
	updateWorkflowTemplate,
} from "./workflow-graph-mutations";
