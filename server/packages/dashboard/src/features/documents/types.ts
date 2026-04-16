export type { JSONValue } from "@arcnem-vision/shared";

export type DocumentItem = {
	id: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number;
	createdAt: string;
	description: string | null;
	projectId: string;
	apiKeyId: string | null;
	thumbnailUrl: string;
	distance: number | null;
};

export type DocumentsResponse = {
	documents: DocumentItem[];
	nextCursor: string | null;
};

export type SegmentedResultItem = {
	segmentationId: string;
	segmentationCreatedAt: string;
	modelLabel: string;
	prompt: string | null;
	document: DocumentItem;
};

export type DocumentSegmentationsResponse = {
	segmentedResults: SegmentedResultItem[];
};

export type OCRResultItem = {
	ocrResultId: string;
	ocrCreatedAt: string;
	modelLabel: string;
	text: string;
	avgConfidence: number | null;
	result: import("@arcnem-vision/shared").JSONValue;
};

export type DocumentOCRResultsResponse = {
	ocrResults: OCRResultItem[];
};

export type DocumentUploadTarget = {
	presignedUploadId: string;
	objectKey: string;
	uploadUrl: string;
	contentType: string;
	maxSizeBytes: number;
	expiresInSeconds: number;
};

export type DocumentUploadAckResponse = {
	status: "verified";
	documentId: string;
	presignedUploadId: string;
	document: DocumentItem;
};

export type DocumentWorkflowRunResponse = {
	status: "queued";
	documentId: string;
	workflowId: string;
	workflowName: string;
};
