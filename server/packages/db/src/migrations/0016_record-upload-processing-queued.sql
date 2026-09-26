ALTER TABLE "presigned_uploads" ADD COLUMN "processing_queued_at" timestamp;--> statement-breakpoint
-- Uploads acknowledged before this migration were queued (or reported as
-- failed) once, with no replay path. Treat them as queued so a late repeated
-- acknowledgement never processes an old upload again.
UPDATE "presigned_uploads" SET "processing_queued_at" = "updated_at" WHERE "status" = 'verified';
