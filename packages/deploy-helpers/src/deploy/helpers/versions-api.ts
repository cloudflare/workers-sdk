import { retryOnAPIFailure, UserError } from "@cloudflare/workers-utils";
import { fetchResult, logger } from "../../shared/context";
import type {
	ApiDeployment,
	ApiVersion,
	Percentage,
	VersionCache,
	VersionId,
} from "./versions-types";
import type {
	ComplianceConfig,
	Observability,
	StreamingTailConsumer,
	TailConsumer,
} from "@cloudflare/workers-utils";

export async function fetchVersion(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionId: VersionId,
	versionCache: VersionCache | undefined
): Promise<ApiVersion> {
	const cachedVersion = versionCache?.get(versionId);
	if (cachedVersion) {
		return cachedVersion;
	}

	const version = await fetchResult<ApiVersion>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts/${workerName}/versions/${versionId}`
	);

	versionCache?.set(version.id, version);

	return version;
}

export async function fetchVersions(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionCache: VersionCache | undefined,
	versionIds: VersionId[]
) {
	return Promise.all(
		versionIds.map((versionId) =>
			fetchVersion(
				complianceConfig,
				accountId,
				workerName,
				versionId,
				versionCache
			)
		)
	);
}

export async function fetchLatestDeployments(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	abortSignal?: AbortSignal
): Promise<ApiDeployment[]> {
	const signal = abortSignal ?? AbortSignal.timeout(95_000);
	const { deployments } = await retryOnAPIFailure(
		() =>
			fetchResult<{ deployments: ApiDeployment[] }>(
				complianceConfig,
				`/accounts/${accountId}/workers/scripts/${workerName}/deployments`,
				{},
				undefined,
				AbortSignal.any([signal, AbortSignal.timeout(30_000)])
			),
		logger,
		1000,
		3,
		signal
	);

	return deployments;
}
export async function fetchLatestDeployment(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	abortSignal?: AbortSignal
): Promise<ApiDeployment | undefined> {
	const deployments = await fetchLatestDeployments(
		complianceConfig,
		accountId,
		workerName,
		abortSignal
	);

	return deployments.at(0);
}

export async function fetchDeploymentVersions(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	deployment: ApiDeployment | undefined,
	versionCache: VersionCache
): Promise<[ApiVersion[], Map<VersionId, Percentage>]> {
	if (!deployment) {
		return [[], new Map()];
	}

	const versionTraffic = new Map(
		deployment.versions.map((v) => [v.version_id, v.percentage])
	);

	const versions = await fetchVersions(
		complianceConfig,
		accountId,
		workerName,
		versionCache,
		[...versionTraffic.keys()]
	);

	return [versions, versionTraffic];
}

export async function fetchDeployableVersions(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionCache: VersionCache
): Promise<ApiVersion[]> {
	const { items: versions } = await fetchResult<{
		items: ApiVersion[];
	}>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts/${workerName}/versions?deployable=true`
	);

	for (const version of versions) {
		versionCache.set(version.id, version);
	}

	return versions;
}

export async function createDeployment(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionTraffic: Map<VersionId, Percentage>,
	message: string | undefined,
	force: boolean | undefined,
	codeUpdateStrategy?: unknown,
	abortSignal?: AbortSignal
) {
	// The generated Cloudflare SDK does not expose code_update_strategy yet.
	// Keep this request here until the updated deployment schema reaches the SDK.
	return await fetchResult<{ id: string }>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts/${workerName}/deployments${force ? "?force=true" : ""}`,

		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				strategy: "percentage",
				versions: Array.from(versionTraffic).map(
					([version_id, percentage]) => ({ version_id, percentage })
				),
				annotations: {
					"workers/message": message,
				},
				code_update_strategy: codeUpdateStrategy,
			}),
		},
		undefined,
		abortSignal
	);
}

export async function createDeploymentWithRetry(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionTraffic: Map<VersionId, Percentage>,
	message: string | undefined,
	previousDeploymentID: string | undefined,
	codeUpdateStrategy?: unknown
) {
	const signal = AbortSignal.timeout(95_000);
	let attempted = false;

	return retryOnAPIFailure(
		async () => {
			if (attempted) {
				const latest = await fetchLatestDeployment(
					complianceConfig,
					accountId,
					workerName,
					signal
				);

				if (latest?.id !== previousDeploymentID) {
					if (
						latest?.strategy === "percentage" &&
						latest.versions.length === versionTraffic.size &&
						latest.versions.every(
							({ version_id, percentage }) =>
								versionTraffic.get(version_id) === percentage
						) &&
						latest.annotations?.["workers/message"] === message
					) {
						return { id: latest.id };
					}

					throw new UserError(
						"The Worker deployment changed while retrying. Refusing to overwrite the newer deployment.",
						{ telemetryMessage: true }
					);
				}
			}

			attempted = true;

			return createDeployment(
				complianceConfig,
				accountId,
				workerName,
				versionTraffic,
				message,
				undefined,
				codeUpdateStrategy,
				AbortSignal.any([signal, AbortSignal.timeout(30_000)])
			);
		},
		logger,
		1000,
		3,
		signal
	);
}

export type NonVersionedScriptSettings = {
	logpush: boolean;
	tags: string[] | null;
	tail_consumers: TailConsumer[];
	streaming_tail_consumers: StreamingTailConsumer[];
	observability: Observability;
};

export async function patchNonVersionedScriptSettings(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	settings: Partial<NonVersionedScriptSettings>
) {
	const res = await fetchResult<typeof settings>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts/${workerName}/script-settings`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(settings),
		}
	);

	// TODO: handle specific errors

	return res;
}
