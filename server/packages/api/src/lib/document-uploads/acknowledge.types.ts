import type { Inngest } from "inngest";

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

export type QueueProcessingWithoutResult = {
	enabled: false;
	code?: undefined;
};

export type QueueProcessingWithResult =
	| {
			enabled: false;
			code: UploadProcessingSkippedCode;
	  }
	| {
			enabled: true;
			inngestClient: Inngest;
			agentGraphId?: string;
	  };

export type QueueProcessingOptions =
	| QueueProcessingWithoutResult
	| QueueProcessingWithResult;

export type AcknowledgedUpload = {
	status: "verified";
	documentId: string;
	presignedUploadId: string;
};

export type AcknowledgedUploadWithProcessing = AcknowledgedUpload & {
	processing: WorkflowUploadProcessing;
};
