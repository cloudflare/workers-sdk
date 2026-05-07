import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { cancel } from "@cloudflare/cli-shared-helpers";
import { verifyDockerInstalled } from "@cloudflare/containers-shared";
import {
	APIError,
	experimental_patchConfig,
	getDockerPath,
	parseNonHyphenedUuid,
} from "@cloudflare/workers-utils";
import { Response } from "undici";
import { buildAssetManifest, syncAssets } from "../assets";
import { fetchResult } from "../cfetch";
import { buildContainer } from "../containers/build";
import { getNormalizedContainerOptions } from "../containers/config";
import { deployContainers } from "../containers/deploy";
import { createCommand } from "../core/create-command";
import { getBindings, provisionBindings } from "../deployment-bundle/bindings";
import { bundleWorker } from "../deployment-bundle/bundle";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { logBuildOutput } from "../deployment-bundle/esbuild-plugins/log-build-output";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../deployment-bundle/module-collection";
import { noBundleWorker } from "../deployment-bundle/no-bundle-worker";
import {
	addRequiredSecretsInheritBindings,
	handleMissingSecretsError,
} from "../deployment-bundle/secrets-validation";
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { confirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import {
	applyServiceAndEnvironmentTags,
	tagsAreEqual,
	warnOnErrorUpdatingServiceAndEnvironmentTags,
} from "../environments";
import { getFlag } from "../experimental-flags";
import isInteractive, { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import { getMetricsUsageHeaders } from "../metrics";
import * as metrics from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { writeOutput } from "../output";
import { getWranglerTmpDir } from "../paths";
import { ensureQueuesExistByConfig } from "../queues/client";
import { parseBulkInputToObject } from "../secret";
import { syncWorkersSite } from "../sites";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import triggersDeploy from "../triggers/deploy";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { downloadWorkerConfig } from "../utils/download-worker-config";
import { helpIfErrorIsSizeOrScriptStartup } from "../utils/friendly-validator-errors";
import { printBindings } from "../utils/print-bindings";
import { retryOnAPIFailure } from "../utils/retry";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import { isWorkerNotFoundError } from "../utils/worker-not-found-error";
import {
	createDeployment,
	patchNonVersionedScriptSettings,
} from "../versions/api";
import { confirmLatestDeploymentOverwrite } from "../versions/deploy";
import { maybeRunAutoConfig, promptForMissingConfig } from "./autoconfig";
import { checkRemoteSecretsOverride } from "./check-remote-secrets-override";
import { checkWorkflowConflicts } from "./check-workflow-conflicts";
import { getConfigPatch, getRemoteConfigDiff } from "./config-diffs";
import { formatTime } from "./deploy";
import { resolveDeployConfig, validateArgs } from "./shared";
import type { StartDevWorkerInput } from "../api/startDevWorker/types";
import type { Entry } from "../deployment-bundle/entry";
import type { RetrieveSourceMapFunction } from "../sourcemap";
import type { ApiVersion, Percentage, VersionId } from "../versions/types";
import type {
	CfModule,
	CfScriptFormat,
	CfWorkerInit,
	Config,
	RawConfig,
} from "@cloudflare/workers-utils";
import type { FormData } from "undici";

export const deployCommand = createCommand({
	metadata: {
		description: "🆙 Deploy a Worker to Cloudflare",
		owner: "Workers: Deploy and Config",
		status: "stable",
		category: "Compute & AI",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		// We want to have a --no-bundle flag, but yargs requires that
		// we also have a --bundle flag (that it adds the --no to by itself)
		// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
		// that's visible to the user but doesn't "do" anything.
		bundle: {
			describe: "Run Wrangler's compilation step before publishing",
			type: "boolean",
			hidden: true,
		},
		"no-bundle": {
			describe: "Skip internal build steps and directly deploy Worker",
			type: "boolean",
			default: false,
		},
		outdir: {
			describe: "Output directory for the bundled Worker",
			type: "string",
			requiresArg: true,
		},
		outfile: {
			describe: "Output file for the bundled worker",
			type: "string",
			requiresArg: true,
		},
		"compatibility-date": {
			describe: "Date to use for compatibility checks",
			type: "string",
			requiresArg: true,
		},
		"compatibility-flags": {
			describe: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			requiresArg: true,
			array: true,
		},
		latest: {
			describe: "Use the latest version of the Workers runtime",
			type: "boolean",
			default: false,
		},
		assets: {
			describe: "Static assets to be served. Replaces Workers Sites.",
			type: "string",
			requiresArg: true,
		},
		site: {
			describe: "Root folder of static assets for Workers Sites",
			type: "string",
			requiresArg: true,
			hidden: true,
			deprecated: true,
		},
		"site-include": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		"site-exclude": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		var: {
			describe: "A key-value pair to be injected into the script as a variable",
			type: "string",
			requiresArg: true,
			array: true,
		},
		define: {
			describe: "A key-value pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		alias: {
			describe: "A module pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		triggers: {
			describe: "cron schedules to attach",
			alias: ["schedule", "schedules"],
			type: "string",
			requiresArg: true,
			array: true,
		},
		routes: {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		},
		domains: {
			describe: "Custom domains to deploy to",
			alias: "domain",
			type: "string",
			requiresArg: true,
			array: true,
		},
		"jsx-factory": {
			describe: "The function that is called for each JSX element",
			type: "string",
			requiresArg: true,
		},
		"jsx-fragment": {
			describe: "The function that is called for each JSX fragment",
			type: "string",
			requiresArg: true,
		},
		tsconfig: {
			describe: "Path to a custom tsconfig.json file",
			type: "string",
			requiresArg: true,
		},
		minify: {
			describe: "Minify the Worker",
			type: "boolean",
		},
		"node-compat": {
			describe: "Enable Node.js compatibility",
			type: "boolean",
			hidden: true,
			deprecated: true,
		},
		"dry-run": {
			describe: "Don't actually deploy",
			type: "boolean",
		},
		metafile: {
			describe:
				"Path to output build metadata from esbuild. If flag is used without a path, defaults to 'bundle-meta.json' inside the directory specified by --outdir.",
			type: "string",
			coerce: (v: string) => (!v ? true : v),
		},
		"keep-vars": {
			describe:
				"When not used (or set to false), Wrangler will delete all vars before setting those found in the Wrangler configuration.\n" +
				"When used (and set to true), the environment variables are not deleted before the deployment.\n" +
				"If you set variables via the dashboard you probably want to use this flag.\n" +
				"Note that secrets are never deleted by deployments.",
			default: false,
			type: "boolean",
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
		logpush: {
			type: "boolean",
			describe:
				"Send Trace Events from this Worker to Workers Logpush.\nThis will not configure a corresponding Logpush job automatically.",
		},
		"upload-source-maps": {
			type: "boolean",
			describe: "Include source maps when uploading this Worker.",
		},
		"old-asset-ttl": {
			describe:
				"Expire old assets in given seconds rather than immediate deletion.",
			type: "number",
		},
		"dispatch-namespace": {
			describe:
				"Name of a dispatch namespace to deploy the Worker to (Workers for Platforms)",
			type: "string",
		},
		"containers-rollout": {
			describe:
				"Rollout strategy for Containers changes. If set to immediate, it will override `rollout_percentage_steps` if configured and roll out to 100% of instances in one step. ",
			choices: ["immediate", "gradual"] as const,
		},
		tag: {
			describe: "A tag for this Worker Version",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe: "A descriptive message for this Worker Version and Deployment",
			type: "string",
			requiresArg: true,
		},
		strict: {
			describe:
				"Enables strict mode for the deploy command, this prevents deployments to occur when there are even small potential risks.",
			type: "boolean",
			default: false,
		},
		"experimental-autoconfig": {
			alias: ["x-autoconfig"],
			describe:
				"Experimental: Enables framework detection and automatic configuration when deploying",
			type: "boolean",
			default: true,
		},
		"secrets-file": {
			describe:
				"Path to a file containing secrets to upload with the deployment (JSON or .env format). Secrets from previous deployments will not be deleted - see `--keep-secrets`",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: false,
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
		}),
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		printMetricsBanner: true,
	},
	validateArgs(args) {
		validateArgs(args);
	},
	async handler(args, { config }) {
		const autoConfigResult = await maybeRunAutoConfig(args, config);
		if (autoConfigResult.aborted) {
			return;
		}
		config = autoConfigResult.config;

		args = await promptForMissingConfig(args, config);
		const beforeUpload = Date.now();

		const {
			name,
			workerTag,
			versionId,
			targets,
			workerNameOverridden,
			entry,
			sourceMapSize,
		} = await deployWorker({
			config,
			args,
		});
		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: name ?? null,
			worker_tag: workerTag,
			version_id: versionId,
			targets,
			wrangler_environment: args.env,
			worker_name_overridden: workerNameOverridden ?? false,
		});

		metrics.sendMetricsEvent(
			"deploy worker script",
			{
				usesTypeScript: /\.tsx?$/.test(entry.file),
				durationMs: Date.now() - beforeUpload,
				sourceMapSize,
			},
			{
				sendMetrics: config.send_metrics,
			}
		);
	},
});

export type DeployArgs = (typeof deployCommand)["args"];

/**
 * Core deploy logic extracted from the handler. This function handles the actual
 * Worker upload, version creation, and trigger deployment.
 */
async function deployWorker({
	config,
	args,
}: {
	config: Config;

	args: DeployArgs;
}): Promise<{
	versionId: string | null;
	workerTag: string | null;
	entry: Entry;
	name: string | null;
	workerNameOverridden?: boolean;
	sourceMapSize?: number;
	targets?: string[];
}> {
	const start = Date.now();

	const mergedConfig = await resolveDeployConfig(args, config);

	// TODO: create a function for non-dry-run API requiring stuff
	const accountId = args.dryRun ? undefined : await requireAuth(config);

	const deployConfirm = getDeployConfirmFunction(args.strict);

	// TODO: warn if git/hg has uncommitted changes
	let workerTag: string | null = null;
	let versionId: string | null = null;
	let tags: string[] = []; // arbitrary metadata tags, not to be confused with script tag or annotations

	let workerExists: boolean = true;

	if (!args.dryRun) {
		assert(accountId, "Missing account ID");
		await verifyWorkerMatchesCITag(
			config,
			accountId,
			mergedConfig.name,
			config.configPath
		);
		if (!args.dispatchNamespace) {
			try {
				const serviceMetaData = await fetchResult<{
					default_environment: {
						environment: string;
						script: {
							tag: string;
							tags: string[] | null;
							last_deployed_from: "dash" | "wrangler" | "api";
						};
					};
				}>(
					config,
					`/accounts/${accountId}/workers/services/${mergedConfig.name}`
				);
				const {
					default_environment: { script },
				} = serviceMetaData;
				workerTag = script.tag;
				tags = script.tags ?? tags;

				if (script.last_deployed_from === "dash") {
					const remoteWorkerConfig = await downloadWorkerConfig(
						mergedConfig.name,
						serviceMetaData.default_environment.environment,
						mergedConfig.entry.file,
						accountId
					);

					const configDiff = getRemoteConfigDiff(remoteWorkerConfig, {
						...config,
						// We also want to include all the routes used for deployment
						routes: mergedConfig.routes,
					});

					// If there are only additive changes (or no changes at all) there should be no problem,
					// just using the local config (and override the remote one) should be totally fine
					if (!configDiff.nonDestructive) {
						logger.warn(
							"The local configuration being used (generated from your local configuration file) differs from the remote configuration of your Worker set via the Cloudflare Dashboard:" +
								`\n${configDiff.diff}\n\n` +
								"Deploying the Worker will override the remote configuration with your local one."
						);
						if (!(await deployConfirm("Would you like to continue?"))) {
							if (
								config.userConfigPath &&
								/\.jsonc?$/.test(config.userConfigPath)
							) {
								if (
									await confirm(
										"Would you like to update the local config file with the remote values?",
										{
											defaultValue: true,
											fallbackValue: true,
										}
									)
								) {
									const patchObj: RawConfig = getConfigPatch(
										configDiff.diff,
										args.env
									);

									experimental_patchConfig(
										config.userConfigPath,
										patchObj,
										false
									);
								}
							}

							return {
								versionId,
								workerTag,
								entry: mergedConfig.entry,
								name: mergedConfig.name,
							};
						}
					}
				} else if (script.last_deployed_from === "api") {
					logger.warn(
						`You are about to publish a Workers Service that was last updated via the script API.\nEdits that have been made via the script API will be overridden by your local code and config.`
					);
					if (!(await deployConfirm("Would you like to continue?"))) {
						return {
							versionId,
							workerTag,
							entry: mergedConfig.entry,
							name: mergedConfig.name,
						};
					}
				}
			} catch (e) {
				if (isWorkerNotFoundError(e)) {
					workerExists = false;
				} else {
					throw e;
				}
			}
		}

		if (isInteractive() || args.strict) {
			const remoteSecretsCheck = await checkRemoteSecretsOverride(
				config,
				args.env
			);

			if (remoteSecretsCheck?.override) {
				logger.warn(remoteSecretsCheck.deployErrorMessage);
				if (!(await deployConfirm("Would you like to continue?"))) {
					return {
						versionId,
						workerTag,
						name: mergedConfig.name,
						entry: mergedConfig.entry,
					};
				}
			}
		}

		if (config.workflows?.length && (isInteractive() || args.strict)) {
			const workflowCheck = await checkWorkflowConflicts(
				config,
				accountId,
				mergedConfig.name
			);

			if (workflowCheck.hasConflicts) {
				logger.warn(workflowCheck.message);
				if (!(await deployConfirm("Do you want to continue?"))) {
					return {
						versionId,
						workerTag,
						name: mergedConfig.name,
						entry: mergedConfig.entry,
					};
				}
			}
		}
		await ensureQueuesExistByConfig(config);
		if (!args.dispatchNamespace && !mergedConfig.useServiceEnvApiPath) {
			const yes = await confirmLatestDeploymentOverwrite(
				config,
				accountId,
				mergedConfig.name
			);
			if (!yes) {
				cancel("Aborting deploy...");
				return {
					versionId,
					workerTag,
					entry: mergedConfig.entry,
					name: mergedConfig.name,
				};
			}
		}
	}
	const scriptName = mergedConfig.name;
	const envName = args.env ?? "production";

	const workerName = mergedConfig.useServiceEnvApiPath
		? `${scriptName} (${envName})`
		: scriptName;

	// build stuff starts here
	if (args.outdir) {
		// we're using a custom output directory,
		// so let's first ensure it exists
		mkdirSync(args.outdir, { recursive: true });
		// add a README
		const readmePath = path.join(args.outdir, "README.md");
		writeFileSync(
			readmePath,
			`This folder contains the built output assets for the worker "${scriptName}" generated at ${new Date().toISOString()}.`
		);
	}

	const destination =
		args.outdir ?? getWranglerTmpDir(mergedConfig.entry.projectRoot, "deploy");

	const workerUrl = args.dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${args.dispatchNamespace}/scripts/${scriptName}`
		: mergedConfig.useServiceEnvApiPath
			? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
			: `/accounts/${accountId}/workers/scripts/${scriptName}`;

	let sourceMapSize;
	const normalisedContainerConfig = await getNormalizedContainerOptions(
		config,
		{
			containersRollout: args.containersRollout,
			dryRun: args.dryRun,
		}
	);

	try {
		if (mergedConfig.noBundle) {
			// if we're not building, let's just copy the entry to the destination directory
			const destinationDir =
				typeof destination === "string" ? destination : destination.path;
			mkdirSync(destinationDir, { recursive: true });
			writeFileSync(
				path.join(destinationDir, path.basename(mergedConfig.entry.file)),
				readFileSync(mergedConfig.entry.file, "utf-8")
			);
		}

		const entryDirectory = path.dirname(mergedConfig.entry.file);
		const moduleCollector = createModuleCollector({
			wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
				entryDirectory,
				mergedConfig.entry.file
			),
			entry: mergedConfig.entry,
			// `moduleCollector` doesn't get used when `noBundle` is set, so
			// `findAdditionalModules` always defaults to `false`
			findAdditionalModules: config.find_additional_modules ?? false,
			rules: mergedConfig.rules,
			preserveFileNames: config.preserve_file_names ?? false,
		});

		const {
			modules,
			dependencies,
			resolvedEntryPointPath,
			bundleType,
			...bundle
		} = mergedConfig.noBundle
			? await noBundleWorker(
					mergedConfig.entry,
					mergedConfig.rules,
					args.outdir,
					config.python_modules.exclude
				)
			: await bundleWorker(
					mergedConfig.entry,
					typeof destination === "string" ? destination : destination.path,
					{
						metafile: args.metafile,
						bundle: true,
						additionalModules: [],
						moduleCollector,
						doBindings: config.durable_objects.bindings,
						workflowBindings: config.workflows ?? [],
						jsxFactory: mergedConfig.jsxFactory,
						jsxFragment: mergedConfig.jsxFragment,
						tsconfig: mergedConfig.tsconfig,
						minify: mergedConfig.minify,
						keepNames: config.keep_names ?? true,
						sourcemap: mergedConfig.uploadSourceMaps,
						nodejsCompatMode: mergedConfig.nodejsCompatMode,
						compatibilityDate: mergedConfig.compatibilityDate,
						compatibilityFlags: mergedConfig.compatibilityFlags,
						define: mergedConfig.defines,
						checkFetch: false,
						alias: mergedConfig.alias,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "deploy",
						local: false,
						projectRoot: mergedConfig.entry.projectRoot,
						defineNavigatorUserAgent: isNavigatorDefined(
							mergedConfig.compatibilityDate,
							mergedConfig.compatibilityFlags
						),
						plugins: [logBuildOutput(mergedConfig.nodejsCompatMode)],

						// Pages specific options used by wrangler pages commands
						entryName: undefined,
						inject: undefined,
						isOutfile: undefined,
						external: undefined,

						// These options are dev-only
						testScheduled: undefined,
						watch: undefined,
					}
				);

		// Add modules to dependencies for size warning
		for (const module of modules) {
			const modulePath =
				module.filePath === undefined
					? module.name
					: path.relative("", module.filePath);
			const bytesInOutput =
				typeof module.content === "string"
					? Buffer.byteLength(module.content)
					: module.content.byteLength;
			dependencies[modulePath] = { bytesInOutput };
		}

		const content = readFileSync(resolvedEntryPointPath, {
			encoding: "utf-8",
		});

		// durable object migrations
		const migrations = !args.dryRun
			? await getMigrationsToUpload(scriptName, {
					accountId,
					config,
					// getMigrationsToUpload needs the raw config value (not the
					// env-gated useServiceEnvApiPath) because it has a distinct
					// code path for "service envs enabled, no explicit --env"
					// that fetches the default environment's migration tag.
					useServiceEnvironments: useServiceEnvironments(config),
					env: args.env,
					dispatchNamespace: args.dispatchNamespace,
				})
			: undefined;

		// Upload assets if assets is being used
		const assetsJwt =
			mergedConfig.assetsOptions && !args.dryRun
				? await syncAssets(
						config,
						accountId,
						mergedConfig.assetsOptions.directory,
						scriptName,
						args.dispatchNamespace
					)
				: undefined;

		// validate asset directory
		if (mergedConfig.assetsOptions && args.dryRun) {
			await buildAssetManifest(mergedConfig.assetsOptions.directory);
		}

		const workersSitesAssets = await syncWorkersSite(
			config,
			accountId,
			// When we're using the newer service environments, we wouldn't
			// have added the env name on to the script name. However, we must
			// include it in the kv namespace name regardless (since there's no
			// concept of service environments for kv namespaces yet).
			scriptName + (mergedConfig.useServiceEnvApiPath ? `-${args.env}` : ""),
			mergedConfig.legacyAssetPaths,
			false,
			args.dryRun,
			args.oldAssetTtl
		);

		const bindings = getBindings(config);

		// Vars from the CLI (--var) are hidden so their values aren't logged to the terminal
		for (const [bindingName, value] of Object.entries(
			collectKeyValues(args.var) ?? {}
		)) {
			bindings[bindingName] = {
				type: "plain_text",
				value,
				hidden: true,
			};
		}

		if (args.secretsFile) {
			const secretsResult = await parseBulkInputToObject(args.secretsFile);
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
			modules,
			containers: config.containers,
			sourceMaps: mergedConfig.uploadSourceMaps
				? loadSourceMaps(main, modules, bundle)
				: undefined,
			compatibility_date: mergedConfig.compatibilityDate,
			compatibility_flags: mergedConfig.compatibilityFlags,
			keepVars: mergedConfig.keepVars,
			keepSecrets: mergedConfig.keepVars || !!args.secretsFile,
			logpush: args.logpush !== undefined ? args.logpush : config.logpush,
			placement: mergedConfig.placement,
			tail_consumers: config.tail_consumers,
			streaming_tail_consumers: config.streaming_tail_consumers,
			limits: config.limits,
			annotations:
				args.tag || args.message
					? {
							"workers/message": args.message,
							"workers/tag": args.tag,
						}
					: undefined,
			assets:
				mergedConfig.assetsOptions && assetsJwt
					? {
							jwt: assetsJwt,
							routerConfig: mergedConfig.assetsOptions.routerConfig,
							assetConfig: mergedConfig.assetsOptions.assetConfig,
							_redirects: mergedConfig.assetsOptions._redirects,
							_headers: mergedConfig.assetsOptions._headers,
							run_worker_first: mergedConfig.assetsOptions.run_worker_first,
						}
					: undefined,
			observability: config.observability,
			cache: config.cache,
		};

		sourceMapSize = worker.sourceMaps?.reduce(
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
		// * we don't have DO migrations
		// * we aren't an fpw
		// * not a container worker
		const canUseNewVersionsDeploymentsApi =
			workerExists &&
			args.dispatchNamespace === undefined &&
			!mergedConfig.useServiceEnvApiPath &&
			mergedConfig.entry.format === "modules" &&
			migrations === undefined &&
			!config.first_party_worker &&
			config.containers === undefined;

		let workerBundle: FormData;
		const dockerPath = getDockerPath();

		// lets fail earlier in the case where docker isn't installed
		// and we have containers so that we don't get into a
		// disjointed state where the worker updates but the container
		// fails.
		if (normalisedContainerConfig.length) {
			// if you have a registry url specified, you don't need docker
			const hasDockerfiles = normalisedContainerConfig.some(
				(container) => "dockerfile" in container
			);
			if (hasDockerfiles) {
				await verifyDockerInstalled(dockerPath, false);
			}
		}

		if (args.dryRun) {
			if (normalisedContainerConfig.length) {
				for (const container of normalisedContainerConfig) {
					if ("dockerfile" in container) {
						await buildContainer(
							container,
							workerTag ?? "worker-tag",
							args.dryRun,
							dockerPath
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
					mergedConfig.entry.format
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

			if (getFlag("RESOURCES_PROVISION")) {
				await provisionBindings(
					bindings ?? {},
					accountId,
					scriptName,
					args.experimentalAutoCreate,
					config
				);
			}

			workerBundle = createWorkerUploadForm(
				worker,
				addWorkersSitesBindings(
					bindings ?? {},
					workersSitesAssets.namespace,
					workersSitesAssets.manifest,
					mergedConfig.entry.format
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
					const versionResult = await retryOnAPIFailure(async () =>
						fetchResult<ApiVersion>(
							config,
							`/accounts/${accountId}/workers/scripts/${scriptName}/versions`,
							{
								method: "POST",
								body: workerBundle,
								headers: await getMetricsUsageHeaders(config.send_metrics),
							},
							new URLSearchParams({ bindings_inherit: "strict" })
						)
					);

					// Deploy new version to 100%
					const versionMap = new Map<VersionId, Percentage>();
					versionMap.set(versionResult.id, 100);
					await createDeployment(
						config,
						accountId,
						scriptName,
						versionMap,
						args.message
					);

					// Update service and environment tags when using environments
					const nextTags = applyServiceAndEnvironmentTags(config, tags);

					try {
						// Update tail consumers, logpush, and observability settings
						await patchNonVersionedScriptSettings(
							config,
							accountId,
							scriptName,
							{
								tail_consumers: worker.tail_consumers,
								logpush: worker.logpush,
								// If the user hasn't specified observability assume that they want it disabled if they have it on.
								// This is a no-op in the event that they don't have observability enabled, but will remove observability
								// if it has been removed from their Wrangler configuration file
								observability: worker.observability ?? { enabled: false },
								tags: nextTags,
							}
						);
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
					result = await retryOnAPIFailure(async () =>
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
								// pass excludeScript so the whole body of the
								// script doesn't get included in the response
								excludeScript: "true",
								bindings_inherit: "strict",
							})
						)
					);

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
				const message = await helpIfErrorIsSizeOrScriptStartup(
					err,
					dependencies,
					workerBundle,
					mergedConfig.entry.projectRoot
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
		if (args.outfile) {
			// we're using a custom output file,
			// so let's first ensure it's parent directory exists
			mkdirSync(path.dirname(args.outfile), { recursive: true });

			const serializedFormData = await new Response(workerBundle).arrayBuffer();

			writeFileSync(args.outfile, Buffer.from(serializedFormData));
		}
	} finally {
		if (typeof destination !== "string") {
			// this means we're using a temp dir,
			// so let's clean up before we proceed
			destination.remove();
		}
	}

	if (args.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return {
			name: mergedConfig.name,
			entry: mergedConfig.entry,
			workerNameOverridden: mergedConfig.workerNameOverridden,
			versionId,
			workerTag,
		};
	}
	// will exist after dry run has exited
	assert(accountId, "Missing account ID");

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));

	// Early exit for WfP since it doesn't need the below code
	if (args.dispatchNamespace !== undefined) {
		deployWfpUserWorker(args.dispatchNamespace, versionId);
		return {
			name: mergedConfig.name,
			entry: mergedConfig.entry,
			workerNameOverridden: mergedConfig.workerNameOverridden,
			versionId,
			workerTag,
		};
	}

	if (normalisedContainerConfig.length) {
		assert(versionId);
		await deployContainers(config, normalisedContainerConfig, {
			versionId,
			accountId,
			scriptName,
		});
	}

	// deploy triggers
	const targets = await triggersDeploy({
		config,
		accountId,
		scriptName: mergedConfig.name,
		workerName,
		env: args.env,
		crons: mergedConfig.triggers,
		routes: mergedConfig.routes,
		useServiceEnvironments: mergedConfig.useServiceEnvApiPath,
		firstDeploy: !workerExists,
	});

	logger.log("Current Version ID:", versionId);

	return {
		sourceMapSize,
		versionId,
		workerTag,
		targets: targets ?? [],
		name: mergedConfig.name,
		workerNameOverridden: mergedConfig.workerNameOverridden,
		entry: mergedConfig.entry,
	};
}

/**
 * Inject bindings into the Worker to support Workers Sites. These are injected at the last minute so that
 * they don't display in the output of `printBindings()`
 */
function addWorkersSitesBindings(
	bindings: NonNullable<StartDevWorkerInput["bindings"]>,
	namespace: string | undefined,
	manifest:
		| {
				[filePath: string]: string;
		  }
		| undefined,
	format: CfScriptFormat
) {
	const withSites = { ...bindings };
	if (namespace) {
		withSites["__STATIC_CONTENT"] = {
			type: "kv_namespace",
			id: namespace,
		};
	}

	if (manifest && format === "service-worker") {
		withSites["__STATIC_CONTENT_MANIFEST"] = {
			type: "text_blob",
			source: { contents: "__STATIC_CONTENT_MANIFEST" },
		};
	}
	return withSites;
}

function deployWfpUserWorker(
	dispatchNamespace: string,
	versionId: string | null
) {
	// Will go under the "Uploaded" text
	logger.log("  Dispatch Namespace:", dispatchNamespace);
	logger.log("Current Version ID:", versionId);
}

function getDeployConfirmFunction(
	strictMode = false
): (text: string) => Promise<boolean> {
	const nonInteractive = isNonInteractiveOrCI();

	if (nonInteractive && strictMode) {
		return async () => {
			logger.error(
				"Aborting the deployment operation because of conflicts. To override and deploy anyway remove the `--strict` flag"
			);
			process.exitCode = 1;
			return false;
		};
	}

	return confirm;
}
