import type { S3Client } from "bun";
import type {
	DashboardDocumentItem,
	DashboardOCRResultItem,
	DashboardSegmentedResultItem,
	DocumentOCRRow,
	DocumentRow,
	DocumentSegmentationRow,
} from "./types";

const PRESIGN_GET_EXPIRES_IN_SECONDS = 60 * 5;

export function toDocumentItem(
	row: DocumentRow,
	s3Client: S3Client,
): DashboardDocumentItem {
	return {
		id: row.id,
		objectKey: row.objectKey,
		contentType: row.contentType,
		sizeBytes: Number(row.sizeBytes),
		createdAt:
			row.createdAt instanceof Date
				? row.createdAt.toISOString()
				: row.createdAt,
		description: row.description,
		distance: row.distance == null ? null : Number(row.distance),
		projectId: row.projectId,
		deviceId: row.deviceId,
		thumbnailUrl: s3Client.presign(row.objectKey, {
			method: "GET",
			expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
		}),
	};
}

export function toSegmentedResultItem(
	row: DocumentSegmentationRow,
	s3Client: S3Client,
): DashboardSegmentedResultItem {
	return {
		segmentationId: row.segmentationId,
		segmentationCreatedAt:
			row.segmentationCreatedAt instanceof Date
				? row.segmentationCreatedAt.toISOString()
				: row.segmentationCreatedAt,
		modelLabel: row.modelLabel,
		prompt: row.prompt,
		document: toDocumentItem(row, s3Client),
	};
}

export function toOCRResultItem(row: DocumentOCRRow): DashboardOCRResultItem {
	return {
		ocrResultId: row.ocrResultId,
		ocrCreatedAt:
			row.ocrCreatedAt instanceof Date
				? row.ocrCreatedAt.toISOString()
				: row.ocrCreatedAt,
		modelLabel: row.modelLabel,
		text: row.text,
		avgConfidence: row.avgConfidence == null ? null : Number(row.avgConfidence),
		result: row.result,
	};
}
