import assert from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { cancel } from "@cloudflare/cli-shared-helpers";
import { verifyDockerInstalled } from "@cloudflare/containers-shared";
import {
	APIError,
	formatTime,
	getDockerPath,
	hasDurableObjectExports,
	parseNonHyphenedUuid,
	retryOnAPIFailure,
	UserError,
} from "@cloudflare/workers-utils";
import { Response } from "undici";
import { fetchResult, logger } from "../shared/context";
import { triggersDeploy } from "../triggers/deploy";
import {
	buildAssetManifest,
	resolveAssetOptions,
	syncAssets,
} from "./helpers/assets";
import { getBindings } from "./helpers/binding-utils";
import { printBundleSize } from "./helpers/bundle-reporter";
import { confirmLatestDeploymentOverwrite } from "./helpers/confirm-latest-deployment-overwrite";
import { createWorkerUploadForm } from "./helpers/create-worker-upload-form";
import { deployWfpUserWorker } from "./helpers/deploy-wfp";
import {
	applyServiceAndEnvironmentTags,
	tagsAreEqual,
	warnOnErrorUpdatingServiceAndEnvironmentTags,
} from "./helpers/environments";
import { EXPORTS_RECONCILIATION_ERROR_CODE } from "./helpers/error-codes";
import { resolveExportsUploadPayload } from "./helpers/exports";
import {
	isExportsReconciliationErrorDetails,
	renderExportsReconciliationError,
	renderExportsReconciliationSuccess,
} from "./helpers/exports-reconciliation";
import { helpIfErrorIsSizeOrScriptStartup } from "./helpers/friendly-validator-errors";
import { parseBulkInputToObject } from "./helpers/parse-bulk-input";
import { parseConfigPlacement } from "./helpers/placement";
import { printBindings } from "./helpers/print-bindings";
import { provisionBindings } from "./helpers/provision-bindings";
import {
	addRequiredSecretsInheritBindings,
	handleMissingSecretsError,
} from "./helpers/secrets-validation";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "./helpers/sourcemap";
import { useServiceEnvironments as useServiceEnvironmentsConfig } from "./helpers/use-service-environments";
import {
	preUploadApiChecks,
	validateWorkerProps,
} from "./helpers/validate-worker-props";
import {
	createDeployment,
	patchNonVersionedScriptSettings,
} from "./helpers/versions-api";
import { addWorkersSitesBindings } from "./helpers/workers-sites-bindings";
import type { DeployProps, WorkerBuildResult } from "../shared/types";
import type { AssetUploadStats } from "./helpers/assets";
import type { RetrieveSourceMapFunction } from "./helpers/sourcemap";
import type {
	ApiVersion,
	Percentage,
	VersionId,
} from "./helpers/versions-types";
import type {
	ContainerNormalizedConfig,
	ImageURIConfig,
} from "@cloudflare/containers-shared";
import type {
	CfModule,
	CfWorkerInit,
	ComplianceConfig,
	Config,
	ExportsReconciliationResult,
	LegacyAssetPaths,
} from "@cloudflare/workers-utils";
import type { FormData } from "undici";

/**
 * Wrangler-specific functions injected into `deploy()`. These remain in
 * wrangler because they depend on wrangler-only systems (account selection,
 * metrics, the dev-mode worker registry, container orchestration, etc.).
 */
export type DeployCallbacks = {
	syncWorkersSite:
		| ((
				complianceConfig: ComplianceConfig,
				accountId: string | undefined,
				scriptName: string,
				siteAssets: LegacyAssetPaths | undefined,
				preview: boolean,
				dryRun: boolean | undefined,
				oldAssetTTL: number | undefined
		  ) => Promise<{
				manifest: { [filePath: string]: string } | undefined;
				namespace: string | undefined;
		  }>)
		| undefined;
	getNormalizedContainerOptions:
		| ((
				config: Config,
				args: {
					containersRollout?: "gradual" | "immediate" | "none";
					dryRun?: boolean;
				}
		  ) => Promise<ContainerNormalizedConfig[]>)
		| undefined;
	buildContainer:
		| ((
				containerConfig: Exclude<ContainerNormalizedConfig, ImageURIConfig>,
				imageTag: string,
				dryRun: boolean,
				pathToDocker: string,
				verifyDockerIsRunning: boolean
		  ) => Promise<unknown>)
		| undefined;
	deployContainers:
		| ((
				config: Config,
				normalisedContainerConfig: ContainerNormalizedConfig[],
				args: { versionId: string; accountId: string; scriptName: string }
		  ) => Promise<void>)
		| undefined;
	analyseBundle:
		| ((workerBundle: string | FormData) => Promise<Record<string, unknown>>)
		| undefined;
};

export default async function deploy(
	props: DeployProps,
	config: Config,
	buildResult: WorkerBuildResult,
	callbacks: DeployCallbacks
): Promise<{
	sourceMapSize?: number;
	versionId: string | null;
	workerTag: string | null;
	assetUploadStats?: AssetUploadStats;
	targets?: string[];
}> {
	const { entry, compatibilityDate, compatibilityFlags, keepVars, accountId } =
		props;

	const assetsOptions = resolveAssetOptions(props, config);

	// Any validation that does not require API calls should go in validateWorkerProps()
	const { name } = validateWorkerProps({ ...props, assetsOptions }, config);

	// any validation that DOES require API calls should go in preUploadApiChecks()
	const { workerTag, tags, workerExists, aborted } = await preUploadApiChecks(
		props,
		config
	);

	if (aborted) {
		return { versionId: null, workerTag };
	}

	let versionId: string | null = null;
	const scriptName = name;

	const envName = props.env ?? "production";

	const start = Date.now();
	const useServiceEnvironments = props.useServiceEnvApiPath;
	const workerName = useServiceEnvironments
		? `${scriptName} (${envName})`
		: scriptName;
	const workerUrl = props.dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${props.dispatchNamespace}/scripts/${scriptName}`
		: useServiceEnvironments
			? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
			: `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const { format } = entry;
	const { projectRoot } = entry;

	if (
		!props.dispatchNamespace &&
		!useServiceEnvironments &&
		accountId &&
		scriptName
	) {
		const yes = await confirmLatestDeploymentOverwrite(
			config,
			accountId,
			scriptName
		);
		if (!yes) {
			cancel("Aborting deploy...");
			return { versionId, workerTag };
		}
	}

	const isDryRun = props.dryRun;

	const normalisedContainerConfig = callbacks.getNormalizedContainerOptions
		? await callbacks.getNormalizedContainerOptions(config, props)
		: [];
	const {
		modules,
		dependencies,
		resolvedEntryPointPath,
		bundleType,
		content,
		sourceMaps,
	} = buildResult;
	// Durable Object lifecycle is expressed through either legacy `migrations`
	// or the declarative `exports` map. Only one is sent on each upload.
	const { migrations, exports } = await resolveExportsUploadPayload({
		scriptName,
		isDryRun,
		accountId,
		config,
		useServiceEnvironments: useServiceEnvironmentsConfig(config),
		env: props.env,
		dispatchNamespace: props.dispatchNamespace,
	});

	// Upload assets if assets is being used
	const assetsUploadResult =
		assetsOptions && !isDryRun
			? await syncAssets(
					config,
					accountId,
					assetsOptions.directory,
					scriptName,
					props.dispatchNamespace
				)
			: undefined;
	const assetsJwt = assetsUploadResult?.jwt;
	const assetUploadStats = assetsUploadResult?.assetUploadStats;

	// validate asset directory
	if (assetsOptions && isDryRun) {
		await buildAssetManifest(assetsOptions.directory);
	}

	const workersSitesAssets = callbacks.syncWorkersSite
		? await callbacks.syncWorkersSite(
				config,
				accountId,
				// When we're using the newer service environments, we wouldn't
				// have added the env name on to the script name. However, we must
				// include it in the kv namespace name regardless (since there's no
				// concept of service environments for kv namespaces yet).
				scriptName + (useServiceEnvironments ? `-${props.env}` : ""),
				props.legacyAssetPaths,
				false,
				isDryRun,
				props.oldAssetTtl
			)
		: { manifest: undefined, namespace: undefined };

	const bindings = getBindings(config);

	// Vars from the CLI (--var) are hidden so their values aren't logged to the terminal
	for (const [bindingName, value] of Object.entries(props.cliVars)) {
		bindings[bindingName] = {
			type: "plain_text",
			value,
			hidden: true,
		};
	}

	if (props.secretsFile) {
		const secretsResult = await parseBulkInputToObject(props.secretsFile);
		if (secretsResult) {
			for (const [secretName, secretValue] of Object.entries(
				secretsResult.content
			)) {
				bindings[secretName] = {
					type: "secret_text",
					value: secretValue,
				};
			}
		}
	}

	addRequiredSecretsInheritBindings(config, bindings, {
		type: "deploy",
		workerExists,
	});

	if (workersSitesAssets.manifest) {
		modules.push({
			name: "__STATIC_CONTENT_MANIFEST",
			filePath: undefined,
			content: JSON.stringify(workersSitesAssets.manifest),
			type: "text",
		});
	}

	const placement = parseConfigPlacement(config);

	const entryPointName = path.basename(resolvedEntryPointPath);
	const main: CfModule = {
		name: entryPointName,
		filePath: resolvedEntryPointPath,
		content: content,
		type: bundleType,
	};
	const worker: CfWorkerInit = {
		name: scriptName,
		main,
		migrations,
		exports,
		modules,
		containers: config.containers,
		sourceMaps,
		compatibility_date: compatibilityDate,
		compatibility_flags: compatibilityFlags,
		keepVars,
		keepSecrets: keepVars || !!props.secretsFile,
		logpush: props.logpush,
		placement,
		tail_consumers: config.tail_consumers,
		streaming_tail_consumers: config.streaming_tail_consumers,
		limits: config.limits,
		annotations:
			props.tag || props.message
				? {
						"workers/message": props.message,
						"workers/tag": props.tag,
					}
				: undefined,
		assets:
			assetsOptions && assetsJwt
				? {
						jwt: assetsJwt,
						routerConfig: assetsOptions.routerConfig,
						assetConfig: assetsOptions.assetConfig,
						_redirects: assetsOptions._redirects,
						_headers: assetsOptions._headers,
						run_worker_first: assetsOptions.run_worker_first,
					}
				: undefined,
		observability: config.observability,
		cache: config.cache,
	};

	const sourceMapSize = worker.sourceMaps?.reduce(
		(acc, m) => acc + m.content.length,
		0
	);

	await printBundleSize(
		{ name: path.basename(resolvedEntryPointPath), content: content },
		modules
	);

	// We can use the new versions/deployments APIs if we:
	// * are uploading a worker that already exists
	// * aren't a dispatch namespace deploy
	// * aren't a service env deploy
	// * aren't a service Worker
	// * we don't have DO migrations or Durable Object `exports`.
	//   Worker exports do not apply lifecycle changes, so they can use this path.
	// * we aren't an fpw
	// * not a container worker
	const canUseNewVersionsDeploymentsApi =
		workerExists &&
		props.dispatchNamespace === undefined &&
		!useServiceEnvironments &&
		format === "modules" &&
		migrations === undefined &&
		!hasDurableObjectExports(config.exports) &&
		!config.first_party_worker &&
		config.containers === undefined;

	let workerBundle: FormData;
	const dockerPath = getDockerPath();

	// lets fail earlier in the case where docker isn't installed
	// and we have containers so that we don't get into a
	// disjointed state where the worker updates but the container
	// fails.
	if (normalisedContainerConfig.length && props.containersRollout !== "none") {
		// if you have a registry url specified, you don't need docker
		const containersWithDockerfile = normalisedContainerConfig.filter(
			(container) => "dockerfile" in container
		);
		if (containersWithDockerfile.length > 0) {
			await verifyDockerInstalled({
				dockerPath,
				operation: `deploying${isDryRun ? " (even in dry-run mode)" : ""}`,
				imageNoun:
					containersWithDockerfile.length !== 1
						? "the configured images"
						: "the configured image",
				hint: "If you cannot run Docker locally, you can still deploy your Worker by passing --containers-rollout=none. This will not deploy or update your Container.",
			});
		}
	}

	if (isDryRun) {
		if (normalisedContainerConfig.length) {
			for (const container of normalisedContainerConfig) {
				if (
					"dockerfile" in container &&
					props.containersRollout !== "none" &&
					callbacks.buildContainer
				) {
					await callbacks.buildContainer(
						container,
						workerTag ?? "worker-tag",
						isDryRun,
						dockerPath,
						false
					);
				}
			}
		}

		workerBundle = createWorkerUploadForm(
			worker,
			addWorkersSitesBindings(
				bindings ?? {},
				workersSitesAssets.namespace,
				workersSitesAssets.manifest,
				format
			),
			{
				dryRun: true,
				unsafe: config.unsafe,
			}
		);

		printBindings(
			bindings,
			config.tail_consumers,
			config.streaming_tail_consumers,
			config.containers,
			{ warnIfNoBindings: true, unsafeMetadata: config.unsafe?.metadata }
		);
	} else {
		assert(accountId, "Missing accountId");

		if (assetsOptions?.routerConfig.has_user_worker === false) {
			logger.debug("skipping provisioning on assets-only project");
		} else if (props.resourcesProvision) {
			await provisionBindings(
				bindings ?? {},
				accountId,
				scriptName,
				props.experimentalAutoCreate,
				config,
				{
					skipConfigWriteback: props.skipProvisioningConfigWriteback,
				}
			);
		}

		workerBundle = createWorkerUploadForm(
			worker,
			addWorkersSitesBindings(
				bindings ?? {},
				workersSitesAssets.namespace,
				workersSitesAssets.manifest,
				format
			),
			{
				unsafe: config.unsafe,
			}
		);

		let bindingsPrinted = false;

		// Upload the script so it has time to propagate.
		try {
			let result: {
				id: string | null;
				etag: string | null;
				pipeline_hash: string | null;
				mutable_pipeline_id: string | null;
				deployment_id: string | null;
				startup_time_ms?: number;
			};

			// If we're using the new APIs, first upload the version
			if (canUseNewVersionsDeploymentsApi) {
				// Upload new version
				const versionResult = await retryOnAPIFailure(
					async () =>
						fetchResult<ApiVersion>(
							config,
							`/accounts/${accountId}/workers/scripts/${scriptName}/versions`,
							{
								method: "POST",
								body: workerBundle,
								headers: props.sendMetrics
									? { metricsEnabled: "true" }
									: undefined,
							},
							new URLSearchParams({ bindings_inherit: "strict" })
						),
					logger
				);

				// Deploy new version to 100%
				const versionMap = new Map<VersionId, Percentage>();
				versionMap.set(versionResult.id, 100);
				await createDeployment(
					config,
					accountId,
					scriptName,
					versionMap,
					props.message,
					undefined
				);

				// Update service and environment tags when using environments
				const nextTags = applyServiceAndEnvironmentTags(config, tags);

				try {
					// Update tail consumers, logpush, and observability settings
					await patchNonVersionedScriptSettings(config, accountId, scriptName, {
						tail_consumers: worker.tail_consumers,
						logpush: worker.logpush,
						// If the user hasn't specified observability assume that they want it disabled if they have it on.
						// This is a no-op in the event that they don't have observability enabled, but will remove observability
						// if it has been removed from their Wrangler configuration file
						observability: worker.observability ?? { enabled: false },
						tags: nextTags,
					});
				} catch {
					warnOnErrorUpdatingServiceAndEnvironmentTags();
				}

				result = {
					id: null, // fpw - ignore
					etag: versionResult.resources.script.etag,
					pipeline_hash: null, // fpw - ignore
					mutable_pipeline_id: null, // fpw - ignore
					deployment_id: versionResult.id, // version id not deployment id but easier to adapt here
					startup_time_ms: versionResult.startup_time_ms,
				};
			} else {
				const uploadResult = await retryOnAPIFailure(
					async () =>
						fetchResult<{
							id: string | null;
							etag: string | null;
							pipeline_hash: string | null;
							mutable_pipeline_id: string | null;
							deployment_id: string | null;
							startup_time_ms: number;
							exports_reconciliation?: ExportsReconciliationResult;
						}>(
							config,
							workerUrl,
							{
								method: "PUT",
								body: workerBundle,
								headers: props.sendMetrics
									? { metricsEnabled: "true" }
									: undefined,
							},
							new URLSearchParams({
								// pass excludeScript so the whole body of the
								// script doesn't get included in the response
								excludeScript: "true",
								bindings_inherit: "strict",
							})
						),
					logger
				);
				result = uploadResult;
				if (uploadResult.exports_reconciliation) {
					renderExportsReconciliationSuccess(
						uploadResult.exports_reconciliation
					);
				}

				// Update service and environment tags when using environments
				const nextTags = applyServiceAndEnvironmentTags(config, tags);
				if (!tagsAreEqual(tags, nextTags)) {
					try {
						await patchNonVersionedScriptSettings(
							config,
							accountId,
							scriptName,
							{
								tags: nextTags,
							}
						);
					} catch {
						warnOnErrorUpdatingServiceAndEnvironmentTags();
					}
				}
			}

			if (result.startup_time_ms) {
				logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
			}
			bindingsPrinted = true;

			printBindings(
				bindings,
				config.tail_consumers,
				config.streaming_tail_consumers,
				config.containers,
				{ unsafeMetadata: config.unsafe?.metadata }
			);

			versionId = parseNonHyphenedUuid(result.deployment_id);

			if (config.first_party_worker) {
				// Print some useful information returned after publishing
				// Not all fields will be populated for every worker
				// These fields are likely to be scraped by tools, so do not rename
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
		} catch (err) {
			if (!bindingsPrinted) {
				printBindings(
					bindings,
					config.tail_consumers,
					config.streaming_tail_consumers,
					config.containers,
					{ unsafeMetadata: config.unsafe?.metadata }
				);
			}

			// Reconciliation errors include structured per-class details.
			if (
				err instanceof APIError &&
				err.code === EXPORTS_RECONCILIATION_ERROR_CODE &&
				isExportsReconciliationErrorDetails(err.meta?.details)
			) {
				err.preventReport();
				throw new UserError(
					renderExportsReconciliationError(err.meta.details),
					{ telemetryMessage: "deploy do exports reconciliation failed" }
				);
			}

			const message = await helpIfErrorIsSizeOrScriptStartup(
				err,
				dependencies,
				workerBundle,
				projectRoot,
				callbacks.analyseBundle
			);
			if (message !== null) {
				logger.error(message);
			}

			handleMissingSecretsError(err, config, {
				type: "deploy",
				workerExists,
			});

			// Apply source mapping to validation startup errors if possible
			if (
				err instanceof APIError &&
				"code" in err &&
				err.code === 10021 /* validation error */ &&
				err.notes.length > 0
			) {
				err.preventReport();

				if (
					err.notes[0].text ===
					"binding DB of type d1 must have a valid `id` specified [code: 10021]"
				) {
					throw new UserError(
						"You must use a real database in the database_id configuration. You can find your databases using 'wrangler d1 list', or read how to develop locally with D1 here: https://developers.cloudflare.com/d1/configuration/local-development",
						{ telemetryMessage: "deploy d1 database binding invalid id" }
					);
				}

				const maybeNameToFilePath = (moduleName: string) => {
					// If this is a service worker, always return the entrypoint path.
					// Service workers can't have additional JavaScript modules.
					if (bundleType === "commonjs") {
						return resolvedEntryPointPath;
					}
					// Similarly, if the name matches the entrypoint, return its path
					if (moduleName === entryPointName) {
						return resolvedEntryPointPath;
					}
					// Otherwise, return the file path of the matching module (if any)
					for (const module of modules) {
						if (moduleName === module.name) {
							return module.filePath;
						}
					}
				};
				const retrieveSourceMap: RetrieveSourceMapFunction = (moduleName) =>
					maybeRetrieveFileSourceMap(maybeNameToFilePath(moduleName));

				err.notes[0].text = getSourceMappedString(
					err.notes[0].text,
					retrieveSourceMap
				);
			}

			throw err;
		}
	}
	if (props.outfile) {
		// we're using a custom output file,
		// so let's first ensure it's parent directory exists
		mkdirSync(path.dirname(props.outfile), { recursive: true });

		const serializedFormData = await new Response(workerBundle).arrayBuffer();

		writeFileSync(props.outfile, Buffer.from(serializedFormData));
	}

	if (isDryRun) {
		logger.log(`--dry-run: exiting now.`);
		return { versionId, workerTag };
	}

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));

	if (
		normalisedContainerConfig.length &&
		props.containersRollout !== "none" &&
		callbacks.deployContainers
	) {
		assert(versionId && accountId);
		await callbacks.deployContainers(config, normalisedContainerConfig, {
			versionId,
			accountId,
			scriptName,
		});
	}

	// Early exit for WfP since it doesn't need the below code
	if (props.dispatchNamespace !== undefined) {
		deployWfpUserWorker(props.dispatchNamespace, versionId);
		return { versionId, workerTag, assetUploadStats };
	}
	assert(accountId);
	// deploy triggers
	const targets = await triggersDeploy({
		config,
		accountId,
		scriptName,
		env: props.env,
		crons: props.triggers,
		useServiceEnvironments,
		firstDeploy: !workerExists,
		routes: props.routes,
	});

	logger.log("Current Version ID:", versionId);

	return {
		sourceMapSize,
		versionId,
		workerTag,
		assetUploadStats,
		targets: targets ?? [],
	};
}
