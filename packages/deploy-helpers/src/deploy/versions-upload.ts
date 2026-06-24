import assert from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { blue, gray } from "@cloudflare/cli-shared-helpers/colors";
import {
	formatTime,
	ParseError,
	retryOnAPIFailure,
} from "@cloudflare/workers-utils";
import { Response } from "undici";
import { fetchResult, logger } from "../shared/context";
import { getWorkersDevSubdomain } from "../triggers/subdomain";
import { resolveAssetOptions, syncAssets } from "./helpers/assets";
import { getBindings } from "./helpers/binding-utils";
import { printBundleSize } from "./helpers/bundle-reporter";
import { createWorkerUploadForm } from "./helpers/create-worker-upload-form";
import { getMigrationsToUpload } from "./helpers/durable";
import {
	applyServiceAndEnvironmentTags,
	tagsAreEqual,
	warnOnErrorUpdatingServiceAndEnvironmentTags,
} from "./helpers/environments";
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
import { patchNonVersionedScriptSettings } from "./helpers/versions-api";
import type { VersionsUploadProps, WorkerBuildResult } from "../shared/types";
import type { DeployCallbacks } from "./deploy";
import type { RetrieveSourceMapFunction } from "./helpers/sourcemap";
import type { CfWorkerInit, Config } from "@cloudflare/workers-utils";
import type { FormData } from "undici";

export type VersionsUploadCallbacks = Pick<DeployCallbacks, "analyseBundle">;

export default async function versionsUpload(
	props: VersionsUploadProps,
	config: Config,
	buildResult: WorkerBuildResult,
	callbacks: VersionsUploadCallbacks
): Promise<{
	versionId: string | null;
	workerTag: string | null;
	versionPreviewUrl?: string | undefined;
	versionPreviewAliasUrl?: string | undefined;
}> {
	const {
		entry,
		name,
		compatibilityDate,
		compatibilityFlags,
		keepVars,
		accountId,
	} = props;

	const assetsOptions = resolveAssetOptions(props, config);

	// Any validation that does not require API calls should go in validateWorkerProps()
	await validateWorkerProps(props, config);
	assert(name); // already validated inside validateWorkerProps, but TS can't see that

	// any validation that DOES require API calls should go in preUploadApiChecks()
	const { workerTag, tags, aborted } = await preUploadApiChecks(props, config);
	if (aborted) {
		return { versionId: null, workerTag };
	}

	let versionId: string | null = null;
	const scriptName = name;

	const start = Date.now();
	const workerName = scriptName;
	const workerUrl = `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const projectRoot = entry.projectRoot;

	let hasPreview = false;

	const {
		modules,
		dependencies,
		resolvedEntryPointPath,
		bundleType,
		content,
		sourceMaps,
	} = buildResult;
	const bindings = getBindings(config);

	// Vars from the CLI (--var) are hidden so their values aren't logged to the terminal
	for (const [bindingName, value] of Object.entries(props.cliVars)) {
		bindings[bindingName] = {
			type: "plain_text",
			value,
			hidden: true,
		};
	}

	// durable object migrations
	const migrations = !props.dryRun
		? await getMigrationsToUpload(scriptName, {
				accountId,
				config,
				useServiceEnvironments: useServiceEnvironmentsConfig(config),
				env: props.env,
				dispatchNamespace: undefined,
			})
		: undefined;

	// Upload assets if assets is being used
	const assetsJwt =
		assetsOptions && !props.dryRun
			? await syncAssets(config, accountId, assetsOptions.directory, scriptName)
			: undefined;

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

	addRequiredSecretsInheritBindings(config, bindings, { type: "upload" });

	const placement = parseConfigPlacement(config);

	const entryPointName = path.basename(resolvedEntryPointPath);
	const main = {
		name: entryPointName,
		filePath: resolvedEntryPointPath,
		content: content,
		type: bundleType,
	};
	const worker: CfWorkerInit = {
		name: scriptName,
		main,
		migrations,
		modules,
		containers: config.containers,
		sourceMaps,
		compatibility_date: compatibilityDate,
		compatibility_flags: compatibilityFlags,
		keepVars,
		// we never delete secret bindings when uploading, even if we are setting secrets from a file
		// so inherit all unchanged secrets from the previous Worker Version
		keepSecrets: true,
		placement,
		tail_consumers: config.tail_consumers,
		limits: config.limits,
		annotations: {
			"workers/message": props.message,
			"workers/tag": props.tag,
			"workers/alias": props.previewAlias,
		},
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
		logpush: undefined, // logpush and observability are non-versioned settings
		observability: undefined,
		cache: config.cache, // cache is a versioned setting
	};

	await printBundleSize(
		{ name: path.basename(resolvedEntryPointPath), content: content },
		modules
	);

	let workerBundle: FormData;

	if (props.dryRun) {
		workerBundle = createWorkerUploadForm(worker, bindings, {
			dryRun: true,
			unsafe: config.unsafe,
		});
		printBindings(
			bindings,
			config.tail_consumers,
			config.streaming_tail_consumers,
			undefined,
			{ unsafeMetadata: config.unsafe?.metadata }
		);
	} else {
		assert(accountId, "Missing accountId");
		if (assetsOptions?.routerConfig.has_user_worker === false) {
			logger.debug("skipping provisioning on assets-only project");
		} else if (props.resourcesProvision) {
			await provisionBindings(
				bindings,
				accountId,
				scriptName,
				props.experimentalAutoCreate,
				config,
				{
					skipConfigWriteback: props.skipProvisioningConfigWriteback,
				}
			);
		}
		workerBundle = createWorkerUploadForm(worker, bindings, {
			unsafe: config.unsafe,
		});

		let bindingsPrinted = false;

		// Upload the version.
		try {
			const result = await retryOnAPIFailure(
				async () =>
					fetchResult<{
						id: string;
						startup_time_ms: number;
						metadata: {
							has_preview: boolean;
						};
					}>(
						config,
						`${workerUrl}/versions`,
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

			logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
			bindingsPrinted = true;
			printBindings(
				bindings,
				config.tail_consumers,
				config.streaming_tail_consumers,
				undefined,
				{ unsafeMetadata: config.unsafe?.metadata }
			);
			versionId = result.id;
			hasPreview = result.metadata.has_preview;
		} catch (err) {
			if (!bindingsPrinted) {
				printBindings(
					bindings,
					config.tail_consumers,
					config.streaming_tail_consumers,
					undefined,
					{ unsafeMetadata: config.unsafe?.metadata }
				);
			}

			const message = await helpIfErrorIsSizeOrScriptStartup(
				err,
				dependencies,
				workerBundle,
				projectRoot,
				callbacks.analyseBundle
			);
			if (message) {
				logger.error(message);
			}

			handleMissingSecretsError(err, config, { type: "upload" });

			// Apply source mapping to validation startup errors if possible
			if (
				err instanceof ParseError &&
				"code" in err &&
				err.code === 10021 /* validation error */ &&
				err.notes.length > 0
			) {
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

		// Update service and environment tags when using environments

		const nextTags = applyServiceAndEnvironmentTags(config, tags);
		if (!tagsAreEqual(tags, nextTags)) {
			try {
				await patchNonVersionedScriptSettings(config, accountId, scriptName, {
					tags: nextTags,
				});
			} catch {
				warnOnErrorUpdatingServiceAndEnvironmentTags();
			}
		}
	}
	if (props.outfile) {
		// we're using a custom output file,
		// so let's first ensure it's parent directory exists
		mkdirSync(path.dirname(props.outfile), { recursive: true });

		const serializedFormData = await new Response(workerBundle).arrayBuffer();

		writeFileSync(props.outfile, Buffer.from(serializedFormData));
	}

	if (props.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return { versionId, workerTag };
	}
	assert(accountId);

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));
	logger.log("Worker Version ID:", versionId);

	let versionPreviewUrl: string | undefined = undefined;
	let versionPreviewAliasUrl: string | undefined = undefined;

	if (versionId && hasPreview) {
		const { previews_enabled: previews_available_on_subdomain } =
			await fetchResult<{
				previews_enabled: boolean;
			}>(config, `${workerUrl}/subdomain`);

		if (previews_available_on_subdomain) {
			const userSubdomain = await getWorkersDevSubdomain(config, accountId, {
				configPath: config.configPath,
			});
			const shortVersion = versionId.slice(0, 8);
			versionPreviewUrl = `https://${shortVersion}-${workerName}.${userSubdomain}`;
			logger.log(`Version Preview URL: ${versionPreviewUrl}`);

			if (props.previewAlias) {
				versionPreviewAliasUrl = `https://${props.previewAlias}-${workerName}.${userSubdomain}`;
				logger.log(`Version Preview Alias URL: ${versionPreviewAliasUrl}`);
			}
		}
	}

	const cmdVersionsDeploy = blue("wrangler versions deploy");
	const cmdTriggersDeploy = blue("wrangler triggers deploy");
	logger.info(
		gray(`
To deploy this version to production traffic use the command ${cmdVersionsDeploy}

Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command ${cmdVersionsDeploy}

Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command ${cmdTriggersDeploy}
`)
	);

	return { versionId, workerTag, versionPreviewUrl, versionPreviewAliasUrl };
}
