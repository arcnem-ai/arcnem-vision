export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const PRESIGN_EXPIRES_IN_SECONDS = 60 * 5;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
]);

export const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};
