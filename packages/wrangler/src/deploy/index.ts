import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { cancel } from "@cloudflare/cli-shared-helpers";
import { verifyDockerInstalled } from "@cloudflare/containers-shared";
import {
	APIError,
	configFileName,
	experimental_patchConfig,
	getTodaysCompatDate,
	formatConfigSnippet,
	getCIOverrideName,
	getDockerPath,
	parseNonHyphenedUuid,
	UserError,
} from "@cloudflare/workers-utils";
import { Response } from "undici";
import {
	buildAssetManifest,
	getAssetsOptions,
	syncAssets,
	validateAssetsArgsAndConfig,
} from "../assets";
import { fetchResult } from "../cfetch";
import { buildContainer } from "../containers/build";
import { getNormalizedContainerOptions } from "../containers/config";
import { deployContainers } from "../containers/deploy";
import { createCommand } from "../core/create-command";
import { getBindings, provisionBindings } from "../deployment-bundle/bindings";
import { bundleWorker } from "../deployment-bundle/bundle";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { getEntry } from "../deployment-bundle/entry";
import { logBuildOutput } from "../deployment-bundle/esbuild-plugins/log-build-output";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../deployment-bundle/module-collection";
import { noBundleWorker } from "../deployment-bundle/no-bundle-worker";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
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
import {
	getSiteAssetPaths,
	syncWorkersSite,
	type LegacyAssetPaths,
} from "../sites";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import triggersDeploy from "../triggers/deploy";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { downloadWorkerConfig } from "../utils/download-worker-config";
import { helpIfErrorIsSizeOrScriptStartup } from "../utils/friendly-validator-errors";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { parseConfigPlacement } from "../utils/placement";
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
import { formatTime, validateRoutes } from "./deploy";
import { validateArgs } from "./shared";
import type { StartDevWorkerInput } from "../api/startDevWorker/types";
import type { AssetsOptions } from "../assets";
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

		const entry = await getEntry(args, config, "deploy");
		validateAssetsArgsAndConfig(args, config);

		const assetsOptions = getAssetsOptions({
			args,
			config,
		});

		const cliVars = collectKeyValues(args.var);
		const cliDefines = collectKeyValues(args.define);
		const cliAlias = collectKeyValues(args.alias);

		const accountId = args.dryRun ? undefined : await requireAuth(config);

		const siteAssetPaths = getSiteAssetPaths(
			config,
			args.site,
			args.siteInclude,
			args.siteExclude
		);

		const beforeUpload = Date.now();
		let name = getScriptName(args, config);

		const ciOverrideName = getCIOverrideName();
		let workerNameOverridden = false;
		if (ciOverrideName !== undefined && ciOverrideName !== name) {
			logger.warn(
				`Failed to match Worker name. Your config file is using the Worker name "${name}", but the CI system expected "${ciOverrideName}". Overriding using the CI provided Worker name. Workers Builds connected builds will attempt to open a pull request to resolve this config name mismatch.`
			);
			name = ciOverrideName;
			workerNameOverridden = true;
		}

		if (!name) {
			throw new UserError(
				'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: "deploy command missing worker name" }
			);
		}

		if (!args.dryRun) {
			assert(accountId, "Missing account ID");
			await verifyWorkerMatchesCITag(
				config,
				accountId,
				name,
				config.configPath
			);
		}

		// We use the `userConfigPath` to compute the root of a project,
		// rather than a redirected (potentially generated) `configPath`.
		const projectRoot =
			config.userConfigPath && path.dirname(config.userConfigPath);

		const { sourceMapSize, versionId, workerTag, targets } = await deployWorker(
			{
				config,
				accountId,
				name,
				entry,
				args,
				assetsOptions,
				cliVars,
				cliDefines,
				cliAlias,
				siteAssetPaths,
				projectRoot,
			}
		);

		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: name ?? null,
			worker_tag: workerTag,
			version_id: versionId,
			targets,
			wrangler_environment: args.env,
			worker_name_overridden: workerNameOverridden,
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
	accountId,
	name,
	entry,
	args,
	assetsOptions,
	cliVars,
	cliDefines,
	cliAlias,
	siteAssetPaths,
	projectRoot,
}: {
	config: Config;
	accountId: string | undefined;
	name: string;
	entry: Entry;
	args: DeployArgs;
	assetsOptions: AssetsOptions | undefined;
	cliVars: Record<string, string> | undefined;
	cliDefines: Record<string, string> | undefined;
	cliAlias: Record<string, string> | undefined;
	siteAssetPaths: LegacyAssetPaths | undefined;
	projectRoot: string | undefined;
}): Promise<{
	sourceMapSize?: number;
	versionId: string | null;
	workerTag: string | null;
	targets?: string[];
}> {
	const deployConfirm = getDeployConfirmFunction(args.strict);
	const noBundle = !(args.bundle ?? !config.no_bundle);
	const propCompatibilityDate = args.latest
		? getTodaysCompatDate()
		: args.compatibilityDate;
	const propCompatibilityFlags = args.compatibilityFlags;

	// TODO: warn if git/hg has uncommitted changes
	let workerTag: string | null = null;
	let versionId: string | null = null;
	let tags: string[] = []; // arbitrary metadata tags, not to be confused with script tag or annotations

	let workerExists: boolean = true;

	const domainRoutes = (args.domains || []).map((domain) => ({
		pattern: domain,
		custom_domain: true,
	}));
	const routes =
		args.routes ?? config.routes ?? (config.route ? [config.route] : []);
	const allDeploymentRoutes = [...routes, ...domainRoutes];

	if (!args.dispatchNamespace && accountId) {
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
			}>(config, `/accounts/${accountId}/workers/services/${name}`);
			const {
				default_environment: { script },
			} = serviceMetaData;
			workerTag = script.tag;
			tags = script.tags ?? tags;

			if (script.last_deployed_from === "dash") {
				const remoteWorkerConfig = await downloadWorkerConfig(
					name,
					serviceMetaData.default_environment.environment,
					entry.file,
					accountId
				);

				const configDiff = getRemoteConfigDiff(remoteWorkerConfig, {
					...config,
					// We also want to include all the routes used for deployment
					routes: allDeploymentRoutes,
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

						return { versionId, workerTag };
					}
				}
			} else if (script.last_deployed_from === "api") {
				logger.warn(
					`You are about to publish a Workers Service that was last updated via the script API.\nEdits that have been made via the script API will be overridden by your local code and config.`
				);
				if (!(await deployConfirm("Would you like to continue?"))) {
					return { versionId, workerTag };
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

	if (accountId && (isInteractive() || args.strict)) {
		const remoteSecretsCheck = await checkRemoteSecretsOverride(
			config,
			args.env
		);

		if (remoteSecretsCheck?.override) {
			logger.warn(remoteSecretsCheck.deployErrorMessage);
			if (!(await deployConfirm("Would you like to continue?"))) {
				return { versionId, workerTag };
			}
		}
	}

	if (
		accountId &&
		config.workflows?.length &&
		(isInteractive() || args.strict)
	) {
		const workflowCheck = await checkWorkflowConflicts(config, accountId, name);

		if (workflowCheck.hasConflicts) {
			logger.warn(workflowCheck.message);
			if (!(await deployConfirm("Do you want to continue?"))) {
				return { versionId, workerTag };
			}
		}
	}

	const compatibilityDate = propCompatibilityDate ?? config.compatibility_date;
	const compatibilityFlags =
		propCompatibilityFlags ?? config.compatibility_flags;

	if (!compatibilityDate) {
		const compatibilityDateStr = getTodaysCompatDate();

		throw new UserError(
			`A compatibility_date is required when publishing. Add the following to your ${configFileName(config.configPath)} file:
    \`\`\`
    ${formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath, false)}
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
			{ telemetryMessage: "missing compatibility date when deploying" }
		);
	}

	validateRoutes(allDeploymentRoutes, assetsOptions);

	const jsxFactory = args.jsxFactory || config.jsx_factory;
	const jsxFragment = args.jsxFragment || config.jsx_fragment;
	const keepVars = args.keepVars || config.keep_vars;

	const minify = args.minify ?? config.minify;

	const nodejsCompatMode = validateNodeCompatMode(
		compatibilityDate,
		compatibilityFlags,
		{
			noBundle: noBundle ?? config.no_bundle,
		}
	);

	// Warn if user tries minify with no-bundle
	if (noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}

	const scriptName = name;

	assert(
		!config.site || config.site.bucket,
		"A [site] definition requires a `bucket` field with a path to the site's assets directory."
	);

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

	const destination = args.outdir ?? getWranglerTmpDir(projectRoot, "deploy");
	const envName = args.env ?? "production";

	const start = Date.now();
	/** Whether to use the deprecated service environments path */
	const serviceEnvironments = Boolean(
		useServiceEnvironments(config) && args.env
	);
	const workerName = serviceEnvironments
		? `${scriptName} (${envName})`
		: scriptName;
	const workerUrl = args.dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${args.dispatchNamespace}/scripts/${scriptName}`
		: serviceEnvironments
			? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
			: `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const { format } = entry;

	if (
		!args.dispatchNamespace &&
		!serviceEnvironments &&
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

	if (
		!(args.site || config.site) &&
		Boolean(siteAssetPaths) &&
		format === "service-worker"
	) {
		throw new UserError(
			"You cannot use the service-worker format with an `assets` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/",
			{ telemetryMessage: "deploy service worker assets unsupported" }
		);
	}

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code",
			{ telemetryMessage: "deploy wasm modules with es module worker" }
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "[text_blobs] with an ES module worker" }
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "[data_blobs] with an ES module worker" }
		);
	}

	let sourceMapSize;
	const normalisedContainerConfig = await getNormalizedContainerOptions(
		config,
		{
			containersRollout: args.containersRollout,
			dryRun: args.dryRun,
		}
	);
	try {
		if (noBundle) {
			// if we're not building, let's just copy the entry to the destination directory
			const destinationDir =
				typeof destination === "string" ? destination : destination.path;
			mkdirSync(destinationDir, { recursive: true });
			writeFileSync(
				path.join(destinationDir, path.basename(entry.file)),
				readFileSync(entry.file, "utf-8")
			);
		}

		const entryDirectory = path.dirname(entry.file);
		const moduleCollector = createModuleCollector({
			wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
				entryDirectory,
				entry.file
			),
			entry: entry,
			// `moduleCollector` doesn't get used when `noBundle` is set, so
			// `findAdditionalModules` always defaults to `false`
			findAdditionalModules: config.find_additional_modules ?? false,
			rules: getRules(config),
			preserveFileNames: config.preserve_file_names ?? false,
		});
		const uploadSourceMaps = args.uploadSourceMaps ?? config.upload_source_maps;

		const {
			modules,
			dependencies,
			resolvedEntryPointPath,
			bundleType,
			...bundle
		} = noBundle
			? await noBundleWorker(
					entry,
					getRules(config),
					args.outdir,
					config.python_modules.exclude
				)
			: await bundleWorker(
					entry,
					typeof destination === "string" ? destination : destination.path,
					{
						metafile: args.metafile,
						bundle: true,
						additionalModules: [],
						moduleCollector,
						doBindings: config.durable_objects.bindings,
						workflowBindings: config.workflows ?? [],
						jsxFactory,
						jsxFragment,
						tsconfig: args.tsconfig ?? config.tsconfig,
						minify,
						keepNames: config.keep_names ?? true,
						sourcemap: uploadSourceMaps,
						nodejsCompatMode,
						compatibilityDate,
						compatibilityFlags,
						define: { ...config.define, ...cliDefines },
						checkFetch: false,
						alias: { ...config.alias, ...cliAlias },
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "deploy",
						local: false,
						projectRoot: projectRoot,
						defineNavigatorUserAgent: isNavigatorDefined(
							compatibilityDate,
							compatibilityFlags
						),
						plugins: [logBuildOutput(nodejsCompatMode)],

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
					useServiceEnvironments: useServiceEnvironments(config),
					env: args.env,
					dispatchNamespace: args.dispatchNamespace,
				})
			: undefined;

		// Upload assets if assets is being used
		const assetsJwt =
			assetsOptions && !args.dryRun
				? await syncAssets(
						config,
						accountId,
						assetsOptions.directory,
						scriptName,
						args.dispatchNamespace
					)
				: undefined;

		// validate asset directory
		if (assetsOptions && args.dryRun) {
			await buildAssetManifest(assetsOptions.directory);
		}

		const workersSitesAssets = await syncWorkersSite(
			config,
			accountId,
			// When we're using the newer service environments, we wouldn't
			// have added the env name on to the script name. However, we must
			// include it in the kv namespace name regardless (since there's no
			// concept of service environments for kv namespaces yet).
			scriptName + (serviceEnvironments ? `-${args.env}` : ""),
			siteAssetPaths,
			false,
			args.dryRun,
			args.oldAssetTtl
		);

		const bindings = getBindings(config);

		// Vars from the CLI (--var) are hidden so their values aren't logged to the terminal
		for (const [bindingName, value] of Object.entries(cliVars ?? {})) {
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
			modules,
			containers: config.containers,
			sourceMaps: uploadSourceMaps
				? loadSourceMaps(main, modules, bundle)
				: undefined,
			compatibility_date: compatibilityDate,
			compatibility_flags: compatibilityFlags,
			keepVars,
			keepSecrets: keepVars || !!args.secretsFile,
			logpush: args.logpush !== undefined ? args.logpush : config.logpush,
			placement,
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
			!serviceEnvironments &&
			format === "modules" &&
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
					format
				),
				{
					unsafe: config.unsafe,
				}
			);

			await ensureQueuesExistByConfig(config);
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
					projectRoot
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
		return { versionId, workerTag };
	}

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));

	// Early exit for WfP since it doesn't need the below code
	if (args.dispatchNamespace !== undefined) {
		deployWfpUserWorker(args.dispatchNamespace, versionId);
		return { versionId, workerTag };
	}

	if (normalisedContainerConfig.length) {
		assert(versionId && accountId);
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
		name,
		env: args.env,
		triggers: args.triggers,
		routes: allDeploymentRoutes,
		assetsOptions,
		useServiceEnvironments: useServiceEnvironments(config),
		dryRun: args.dryRun,
		firstDeploy: !workerExists,
	});

	logger.log("Current Version ID:", versionId);

	return {
		sourceMapSize,
		versionId,
		workerTag,
		targets: targets ?? [],
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
