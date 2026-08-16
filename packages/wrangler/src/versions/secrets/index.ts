import { APIError, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../cfetch";
import { createNamespace } from "../../core/create-command";
import { getMetricsUsageHeaders } from "../../metrics";
import type {
	CfPlacement,
	CfUserLimits,
	Config,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

export const versionsSecretNamespace = createNamespace({
	metadata: {
		description: "Generate a secret that can be referenced in a Worker",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

// Shared code
export interface WorkerVersion {
	id: string;
	metadata: WorkerMetadata;
	number: number;
}

export interface WorkerMetadata {
	author_email: string;
	author_id: string;
	created_on: string;
	modified_on: string;
	source: string;
}

interface Annotations {
	"workers/message"?: string;
	"workers/tag"?: string;
	"workers/triggered_by"?: string;
}

export interface VersionDetails {
	id: string;
	metadata: WorkerMetadata;
	annotations?: Annotations;
	number: number;
	resources: {
		bindings: WorkerMetadataBinding[];
		script: {
			etag: string;
			handlers: string[];
			placement_mode?: "smart";
			placement?: CfPlacement;
			last_deployed_from: string;
		};
		script_runtime: {
			compatibility_date?: string;
			compatibility_flags?: string[];
			usage_model: "bundled" | "unbound" | "standard";
			limits: CfUserLimits;
		};
	};
	cache_options?: { enabled: boolean };
}

const NO_VERSIONS_ERR_CODE = 10222;
const NO_VERSIONS_MESSAGE =
	"There are currently no uploaded versions of this Worker. Please upload a version before modifying a secret.";

interface PatchLatestWorkerVersionWithSecretsArgs {
	config: Config;
	accountId: string;
	scriptName: string;
	secrets: Record<string, string | null>;
	versionMessage?: string;
	versionTag?: string;
	sendMetrics?: boolean;
	noVersionsTelemetryMessage: string;
}

export async function patchLatestWorkerVersionWithSecrets({
	config,
	accountId,
	scriptName,
	secrets,
	versionMessage,
	versionTag,
	sendMetrics,
	noVersionsTelemetryMessage,
}: PatchLatestWorkerVersionWithSecretsArgs) {
	try {
		return await fetchResult<{ id: string | null }>(
			config,
			`/accounts/${accountId}/workers/workers/${scriptName}/versions/latest`,
			{
				method: "PATCH",
				body: JSON.stringify({
					env: Object.fromEntries(
						Object.entries(secrets).map(([name, value]) => [
							name,
							value === null
								? null
								: {
										type: "secret_text",
										text: value,
									},
						])
					),
					annotations: {
						"workers/message": versionMessage,
						"workers/tag": versionTag,
					},
				}),
				headers: {
					...(await getMetricsUsageHeaders(sendMetrics)),
					"Content-Type": "application/merge-patch+json",
				},
			}
		);
	} catch (e) {
		if (e instanceof APIError && e.code === NO_VERSIONS_ERR_CODE) {
			throw new UserError(NO_VERSIONS_MESSAGE, {
				telemetryMessage: noVersionsTelemetryMessage,
			});
		}

		throw e;
	}
}
