import { S3Client } from "bun";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";

let s3Client: S3Client | null = null;

const buildVirtualHostedEndpoint = (
	endpoint: string,
	bucket: string,
): string => {
	const url = new URL(endpoint);
	if (!url.hostname.startsWith(`${bucket}.`)) {
		url.hostname = `${bucket}.${url.hostname}`;
	}

	return url.toString().replace(/\/$/, "");
};

export const getS3Client = (): S3Client => {
	if (!s3Client) {
		const S3_ACCESS_KEY_ID = getAPIEnvVar("S3_ACCESS_KEY_ID");
		const S3_SECRET_ACCESS_KEY = getAPIEnvVar("S3_SECRET_ACCESS_KEY");
		const S3_BUCKET = getAPIEnvVar("S3_BUCKET");
		const S3_ENDPOINT = getAPIEnvVar("S3_ENDPOINT");
		const S3_REGION = getAPIEnvVar("S3_REGION");
		const usePathStyle = process.env[API_ENV_VAR.S3_USE_PATH_STYLE] === "true";

		s3Client = new S3Client({
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY,
			bucket: S3_BUCKET,
			endpoint: usePathStyle
				? S3_ENDPOINT
				: buildVirtualHostedEndpoint(S3_ENDPOINT, S3_BUCKET),
			region: S3_REGION,
			virtualHostedStyle: !usePathStyle,
		});
	}

	return s3Client;
};
