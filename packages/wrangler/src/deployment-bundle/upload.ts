import { URLSearchParams } from "node:url";
import { parseNonHyphenedUuid } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import {
	applyServiceAndEnvironmentTags,
	tagsAreEqual,
	warnOnErrorUpdatingServiceAndEnvironmentTags,
} from "../environments";
import { logger } from "../logger";
import { getMetricsUsageHeaders } from "../metrics";
import { handleUploadError } from "../utils/friendly-validator-errors";
import { retryOnAPIFailure } from "../utils/retry";
import {
	createDeployment,
	patchNonVersionedScriptSettings,
} from "../versions/api";
import { loadSourceMaps } from "./source-maps";
import type { ApiVersion, Percentage, VersionId } from "../versions/types";
import type { BuildResult } from "./build-worker";
import type { DeployProps, VersionsUploadProps } from "./resolve-input";
import type { CfWorkerInit, Config } from "@cloudflare/workers-utils";
import type { FormData } from "undici";

export type { BuildResult } from "./build-worker";

/**
 * Constructs a CfWorkerInit from props, config, and build result.
 * Uses props.command discriminant to handle deploy vs versions-upload differences.
 */
export function createCfWorkerInit(
	props: DeployProps | VersionsUploadProps,
	config: Config,
	buildResult: BuildResult,
	extras: {
		migrations: CfWorkerInit["migrations"];
		assetsJwt: string | undefined;
	}
): CfWorkerInit {
	const { main, modules, bundle } = buildResult;
	const { migrations, assetsJwt } = extras;

	const isDeploy = props.command === "deploy";

	return {
		name: props.name,
		main,
		migrations,
		modules,
		containers: config.containers,
		sourceMaps: props.uploadSourceMaps
			? loadSourceMaps(main, modules, bundle)
			: undefined,
		compatibility_date: props.compatibilityDate,
		compatibility_flags: props.compatibilityFlags,
		keepVars: props.keepVars,
		keepSecrets: isDeploy ? props.keepVars || !!props.secretsFile : true,
		logpush: isDeploy ? props.logpush : undefined,
		placement: props.placement,
		tail_consumers: config.tail_consumers,
		streaming_tail_consumers: isDeploy
			? config.streaming_tail_consumers
			: undefined,
		limits: config.limits,
		annotations: isDeploy
			? props.tag || props.message
				? {
						"workers/message": props.message,
						"workers/tag": props.tag,
					}
				: undefined
			: {
					"workers/message": props.message,
					"workers/tag": props.tag,
					"workers/alias": props.previewAlias,
				},
		assets:
			props.assetsOptions && assetsJwt
				? {
						jwt: assetsJwt,
						routerConfig: props.assetsOptions.routerConfig,
						assetConfig: props.assetsOptions.assetConfig,
						_redirects: props.assetsOptions._redirects,
						_headers: props.assetsOptions._headers,
						run_worker_first: props.assetsOptions.run_worker_first,
					}
				: undefined,
		observability: isDeploy ? config.observability : undefined,
		cache: config.cache,
	};
}

export type UploadResult = {
	versionId: string | null;
	startupTimeMs?: number;
	/** Only returned by versions upload path */
	hasPreview?: boolean;
	/** Only returned by legacy PUT path (first-party workers) */
	legacyResult?: {
		id: string | null;
		etag: string | null;
		pipeline_hash: string | null;
		mutable_pipeline_id: string | null;
	};
};

/**
 * Upload via the new versions/deployments API.
 *
 * Used by:
 * - `wrangler deploy` when canUseNewVersionsDeploymentsApi is true
 * - `wrangler versions upload` (always)
 *
 * For deploy, also creates a deployment at 100% and patches non-versioned settings.
 * For versions upload, only patches tags if changed.
 */
export async function uploadViaVersionsApi(
	props: DeployProps | VersionsUploadProps,
	config: Config,
	accountId: string,
	workerBundle: FormData,
	tags: string[],
	worker: CfWorkerInit,
	buildResult: BuildResult
): Promise<UploadResult> {
	try {
		const result = await retryOnAPIFailure(async () =>
			fetchResult<ApiVersion & { metadata: { has_preview: boolean } }>(
				config,
				`/accounts/${accountId}/workers/scripts/${props.name}/versions`,
				{
					method: "POST",
					body: workerBundle,
					headers: await getMetricsUsageHeaders(config.send_metrics),
				},
				new URLSearchParams({ bindings_inherit: "strict" })
			)
		);

		logger.log("Worker Startup Time:", result.startup_time_ms, "ms");

		if (props.command === "deploy") {
			// Deploy new version to 100%
			const versionMap = new Map<VersionId, Percentage>();
			versionMap.set(result.id, 100);
			await createDeployment(
				config,
				accountId,
				props.name,
				versionMap,
				props.message
			);

			// Always patch non-versioned settings for deploy
			const nextTags = applyServiceAndEnvironmentTags(config, tags);
			try {
				await patchNonVersionedScriptSettings(config, accountId, props.name, {
					tail_consumers: worker.tail_consumers,
					logpush: worker.logpush,
					observability: worker.observability ?? { enabled: false },
					tags: nextTags,
				});
			} catch {
				warnOnErrorUpdatingServiceAndEnvironmentTags();
			}
		} else {
			// versions upload: only patch tags if changed
			const nextTags = applyServiceAndEnvironmentTags(config, tags);
			if (!tagsAreEqual(tags, nextTags)) {
				try {
					await patchNonVersionedScriptSettings(config, accountId, props.name, {
						tags: nextTags,
					});
				} catch {
					warnOnErrorUpdatingServiceAndEnvironmentTags();
				}
			}
		}

		return {
			versionId:
				props.command === "deploy"
					? parseNonHyphenedUuid(result.id)
					: result.id,
			startupTimeMs: result.startup_time_ms,
			hasPreview: result.metadata?.has_preview,
		};
	} catch (err) {
		await handleUploadError(err, {
			props,
			dependencies: buildResult.dependencies,
			workerBundle,
			bundleType: buildResult.bundleType,
			resolvedEntryPointPath: buildResult.resolvedEntryPointPath,
			entryPointName: buildResult.entryPointName,
			modules: buildResult.modules,
		});
		throw err;
	}
}

/**
 * Upload via the legacy PUT scripts API.
 *
 * Used by deploy when the new versions API can't be used:
 * dispatch namespace, service environments, new workers, DO migrations, containers, FPW.
 */
export async function uploadViaLegacyApi(
	props: DeployProps,
	config: Config,
	accountId: string,
	workerUrl: string,
	workerBundle: FormData,
	tags: string[],
	buildResult: BuildResult
): Promise<UploadResult> {
	try {
		const result = await retryOnAPIFailure(async () =>
			fetchResult<{
				id: string | null;
				etag: string | null;
				pipeline_hash: string | null;
				mutable_pipeline_id: string | null;
				deployment_id: string | null;
				startup_time_ms: number;
			}>(
				config,
				workerUrl,
				{
					method: "PUT",
					body: workerBundle,
					headers: await getMetricsUsageHeaders(config.send_metrics),
				},
				new URLSearchParams({
					excludeScript: "true",
					bindings_inherit: "strict",
				})
			)
		);

		if (result.startup_time_ms) {
			logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
		}

		// Update service and environment tags when using environments
		const nextTags = applyServiceAndEnvironmentTags(config, tags);
		if (!tagsAreEqual(tags, nextTags)) {
			try {
				await patchNonVersionedScriptSettings(config, accountId, props.name, {
					tags: nextTags,
				});
			} catch {
				warnOnErrorUpdatingServiceAndEnvironmentTags();
			}
		}

		if (config.first_party_worker) {
			if (result.id) {
				logger.log("Worker ID: ", result.id);
			}
			if (result.etag) {
				logger.log("Worker ETag: ", result.etag);
			}
			if (result.pipeline_hash) {
				logger.log("Worker PipelineHash: ", result.pipeline_hash);
			}
			if (result.mutable_pipeline_id) {
				logger.log(
					"Worker Mutable PipelineID (Development ONLY!):",
					result.mutable_pipeline_id
				);
			}
		}

		return {
			versionId: parseNonHyphenedUuid(result.deployment_id),
			startupTimeMs: result.startup_time_ms,
			legacyResult: {
				id: result.id,
				etag: result.etag,
				pipeline_hash: result.pipeline_hash,
				mutable_pipeline_id: result.mutable_pipeline_id,
			},
		};
	} catch (err) {
		await handleUploadError(err, {
			props,
			dependencies: buildResult.dependencies,
			workerBundle,
			bundleType: buildResult.bundleType,
			resolvedEntryPointPath: buildResult.resolvedEntryPointPath,
			entryPointName: buildResult.entryPointName,
			modules: buildResult.modules,
		});
		throw err;
	}
}
