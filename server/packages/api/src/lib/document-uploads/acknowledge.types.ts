export const DOCUMENT_VISIBILITIES = ["private", "org", "public"] as const;

export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export function isDocumentVisibility(
	value: unknown,
): value is DocumentVisibility {
	return (
		typeof value === "string" &&
		(DOCUMENT_VISIBILITIES as readonly string[]).includes(value)
	);
}

export type WorkflowUploadProcessing =
	| {
			status: "queued";
	  }
	| {
			status: "skipped";
			code: "workflow_unavailable";
	  }
	| {
			status: "failed";
			code: "processing_enqueue_failed";
	  };

type UploadProcessingSkippedCode = Extract<
	WorkflowUploadProcessing,
	{ status: "skipped" }
>["code"];

export type PendingUpload = {
	id: string;
	bucket: string;
	objectKey: string;
	organizationId: string;
	projectId: string;
	apiKeyId: string | null;
	visibility: DocumentVisibility;
};

export type VerifiedUploadObject = {
	contentType: string;
	size: number;
	eTag: string;
	lastModifiedAt: Date;
};

// Whether an acknowledgement queues the upload's workflow. When it does not,
// a code explains why to the caller; without a code no processing result is
// reported at all.
export type QueueProcessing =
	| { enabled: false; code?: UploadProcessingSkippedCode }
	| { enabled: true; agentGraphId?: string };

// Workflow-key acknowledgements always report what happened to processing.
export type WorkflowQueueProcessing =
	| { enabled: false; code: UploadProcessingSkippedCode }
	| { enabled: true; agentGraphId?: string };

export type AcknowledgedUpload = {
	status: "verified";
	documentId: string;
	presignedUploadId: string;
};

export type AcknowledgedUploadWithProcessing = AcknowledgedUpload & {
	processing: WorkflowUploadProcessing;
};
