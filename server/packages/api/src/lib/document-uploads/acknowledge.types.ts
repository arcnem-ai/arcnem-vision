import type { Inngest } from "inngest";

export type PendingUpload = {
	id: string;
	bucket: string;
	objectKey: string;
	organizationId: string;
	projectId: string;
	deviceId: string | null;
};

export type VerifiedUploadObject = {
	contentType: string;
	size: number;
	eTag: string;
	lastModifiedAt: Date;
};

export type QueueProcessingOptions = {
	enabled: boolean;
	inngestClient?: Inngest;
	agentGraphId?: string;
};

export type AcknowledgedUpload = {
	status: "verified";
	documentId: string;
	presignedUploadId: string;
};
