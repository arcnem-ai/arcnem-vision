import { S3Client } from "bun";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";

let s3Client: S3Client | null = null;

export const getS3Client = (): S3Client => {
	if (!s3Client) {
		const S3_ACCESS_KEY_ID = getAPIEnvVar("S3_ACCESS_KEY_ID");
		const S3_SECRET_ACCESS_KEY = getAPIEnvVar("S3_SECRET_ACCESS_KEY");
		const S3_BUCKET = getAPIEnvVar("S3_BUCKET");
		const S3_ENDPOINT = getAPIEnvVar("S3_ENDPOINT");
		const S3_REGION = getAPIEnvVar("S3_REGION");

		s3Client = new S3Client({
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY,
			bucket: S3_BUCKET,
			endpoint: S3_ENDPOINT,
			region: S3_REGION,
		});
	}

	return s3Client;
};
