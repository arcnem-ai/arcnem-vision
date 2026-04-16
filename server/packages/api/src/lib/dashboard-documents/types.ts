export type DocumentRow = {
	id: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number | string;
	createdAt: Date | string;
	description: string | null;
	distance: number | string | null;
	projectId: string;
	apiKeyId: string | null;
};

export type DocumentSegmentationRow = DocumentRow & {
	segmentationId: string;
	segmentationCreatedAt: Date | string;
	modelLabel: string;
	prompt: string | null;
};

export type DocumentOCRRow = {
	ocrResultId: string;
	ocrCreatedAt: Date | string;
	modelLabel: string;
	text: string;
	avgConfidence: number | string | null;
	result: unknown;
};

export type DashboardDocumentItem = {
	id: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number;
	createdAt: string;
	description: string | null;
	distance: number | null;
	projectId: string;
	apiKeyId: string | null;
	thumbnailUrl: string;
};

export type DashboardSegmentedResultItem = {
	segmentationId: string;
	segmentationCreatedAt: string;
	modelLabel: string;
	prompt: string | null;
	document: DashboardDocumentItem;
};

export type DashboardOCRResultItem = {
	ocrResultId: string;
	ocrCreatedAt: string;
	modelLabel: string;
	text: string;
	avgConfidence: number | null;
	result: unknown;
};

export type DashboardDocumentSearchMatch = {
	documentId: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number;
	createdAt: string;
	projectId: string;
	apiKeyId: string | null;
	snippet: string;
};

export type DashboardDocumentSearchFilters = {
	projectId?: string;
	apiKeyId?: string;
	dashboardUploadsOnly?: boolean;
};

export type DashboardDocumentPageFilters = {
	organizationId: string;
	projectId?: string;
	apiKeyId?: string;
	dashboardUploadsOnly?: boolean;
	cursor?: string;
	limit: number;
};

export type DashboardDocumentPage = {
	rows: DocumentRow[];
	nextCursor: string | null;
};

export type DashboardOrganizationResolution =
	| {
			organizationId: string;
	  }
	| {
			status: 400 | 403;
			message: string;
	  };

export type DashboardDocumentOrganization = {
	id: string;
	organizationId: string;
};

export type DashboardProjectUploadTarget = {
	organizationId: string;
	organizationSlug: string;
	projectId: string;
	projectSlug: string;
};

export type DashboardIssuedUpload = {
	id: string;
	bucket: string;
	objectKey: string;
	organizationId: string;
	projectId: string;
	apiKeyId: string | null;
	visibility: string;
};

export type DashboardDocumentAccessResolution =
	| {
			document: DashboardDocumentOrganization;
	  }
	| {
			status: 403 | 404;
			message: string;
	  };
