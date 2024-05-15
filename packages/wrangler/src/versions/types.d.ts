export type Percentage = number;
export type UUID = string;
export type VersionId = UUID;

export type ApiDeployment = {
	id: string;
	source: "api" | string;
	strategy: "percentage" | string;
	author_email: string;
	annotations?: Record<string, string>;
	created_on: string;
	versions: Array<{
		version_id: VersionId;
		percentage: Percentage;
	}>;
};
export type ApiVersion = {
	id: VersionId;
	number: number;
	metadata: {
		created_on: string;
		modified_on: string;
		source: "api" | string;
		author_id: string;
		author_email: string;
	};
	annotations?: {
		"workers/triggered_by"?: "upload" | string;
		"workers/message"?: string;
		"workers/tag"?: string;
	};
	// other properties not typed as not used
};

type VersionCache = Map<VersionId, ApiVersion>;
