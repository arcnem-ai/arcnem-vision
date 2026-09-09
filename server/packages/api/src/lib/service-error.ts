export class ServiceError extends Error {
	constructor(
		public readonly status: 400 | 403 | 404 | 409 | 502,
		message: string,
		public readonly details?: {
			missingDocumentIds?: string[];
			maxDocumentCount?: number;
		},
	) {
		super(message);
		this.name = "ServiceError";
	}
}
