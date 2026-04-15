export type ParsedPresignRequest = {
	contentType: string;
	visibility?: "private" | "org" | "public";
};

export type ParsedAckRequest = {
	objectKey: string;
};
