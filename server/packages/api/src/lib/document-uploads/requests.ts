import {
	ALLOWED_IMAGE_MIME_TYPES,
	MAX_UPLOAD_SIZE_BYTES,
} from "@/constants/uploads";
import { isDocumentVisibility } from "./acknowledge.types";
import { fail } from "./errors";
import type { ParsedAckRequest, ParsedPresignRequest } from "./requests.types";

export const readJSONBody = async (request: {
	json: () => Promise<unknown>;
}) => {
	try {
		return await request.json();
	} catch {
		fail(400, "Invalid JSON request body");
	}
};

export const parsePresignRequestBody = (
	body: unknown,
): ParsedPresignRequest => {
	if (!body || typeof body !== "object") {
		fail(400, "Request body is required");
	}

	const payload = body as Record<string, unknown>;
	const contentType = payload.contentType;
	const size = payload.size;
	const visibility = payload.visibility;

	if (typeof contentType !== "string" || contentType.trim().length === 0) {
		fail(400, "contentType is required");
	}

	const normalizedContentType = (contentType as string).trim().toLowerCase();
	if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedContentType)) {
		fail(400, "Only image uploads are allowed");
	}

	const parsedSize = typeof size === "number" ? size : Number.NaN;
	if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
		fail(400, "size must be a positive integer");
	}

	if (parsedSize > MAX_UPLOAD_SIZE_BYTES) {
		fail(
			413,
			`File exceeds maximum upload size of ${MAX_UPLOAD_SIZE_BYTES} bytes`,
			{ maxSizeBytes: MAX_UPLOAD_SIZE_BYTES },
		);
	}

	if (visibility !== undefined && !isDocumentVisibility(visibility)) {
		fail(400, "visibility must be one of private, org, or public");
	}

	return {
		contentType: normalizedContentType,
		visibility: visibility as ParsedPresignRequest["visibility"],
	};
};

export const parseAckRequestBody = (body: unknown): ParsedAckRequest => {
	if (!body || typeof body !== "object") {
		fail(400, "Request body is required");
	}

	const payload = body as Record<string, unknown>;
	const objectKey = payload.objectKey;

	if (typeof objectKey !== "string" || objectKey.trim().length === 0) {
		fail(400, "objectKey is required");
	}

	return {
		objectKey: (objectKey as string).trim(),
	};
};
