export type UploadTarget = {
	organizationId: string;
	organizationSlug: string;
	projectId: string;
	projectSlug: string;
	deviceId: string | null;
	objectKeySource: string;
};
