export const MAX_API_BODY_BYTES = 1024 * 1024; // 1 MiB

// Self-hosted Inngest and Inngest Cloud's free plan accept events up to
// 256 KiB. Workflow input travels in the event, so larger input is rejected
// before a run is created. 1 KiB is left for fields the SDK adds, such as ts.
export const MAX_WORKFLOW_EVENT_BYTES = 255 * 1024;
