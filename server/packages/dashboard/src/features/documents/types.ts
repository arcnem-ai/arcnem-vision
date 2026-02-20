export type DocumentItem = {
	id: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number;
	createdAt: string;
	description: string | null;
	thumbnailUrl: string;
	distance: number | null;
};

export type DocumentsResponse = {
	documents: DocumentItem[];
	nextCursor: string | null;
};
