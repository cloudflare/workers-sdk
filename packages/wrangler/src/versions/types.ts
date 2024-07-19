import type { WorkerMetadataBinding } from "../deployment-bundle/create-worker-upload-form";
import type { CfUserLimits } from "../deployment-bundle/worker";

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
	resources: {
		bindings: WorkerMetadataBinding[];
		script: {
			etag: string;
			handlers: string[];
			placement_mode?: "smart";
			last_deployed_from: string;
		};
		script_runtime: {
			compatibility_date?: string;
			compatibility_flags?: string[];
			usage_model: "bundled" | "unbound" | "standard";
			limits: CfUserLimits;
		};
	};
};

export type VersionCache = Map<VersionId, ApiVersion>;
