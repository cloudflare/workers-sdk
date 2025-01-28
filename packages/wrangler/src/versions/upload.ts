import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { blue, gray } from "@cloudflare/cli/colors";
import {
	getAssetsOptions,
	syncAssets,
	validateAssetsArgsAndConfig,
} from "../assets";
import { fetchResult } from "../cfetch";
import { configFileName, formatConfigSnippet } from "../config";
import { createCommand } from "../core/create-command";
import { getBindings, provisionBindings } from "../deployment-bundle/bindings";
import { bundleWorker } from "../deployment-bundle/bundle";
import {
	printBundleSize,
	printOffendingDependencies,
} from "../deployment-bundle/bundle-reporter";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { getEntry } from "../deployment-bundle/entry";
import { logBuildOutput } from "../deployment-bundle/esbuild-plugins/log-build-output";
import {
	findAdditionalModules,
	writeAdditionalModules,
} from "../deployment-bundle/find-additional-modules";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../deployment-bundle/module-collection";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { confirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import { UserError } from "../errors";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import { getMetricsUsageHeaders } from "../metrics";
import * as metrics from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { writeOutput } from "../output";
import { ParseError } from "../parse";
import { getWranglerTmpDir } from "../paths";
import { ensureQueuesExistByConfig } from "../queues/client";
import { getWorkersDevSubdomain } from "../routes";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import { printBindings } from "../utils/print-bindings";
import { retryOnAPIFailure } from "../utils/retry";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type { Rule } from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type { CfPlacement, CfWorkerInit } from "../deployment-bundle/worker";
import type { RetrieveSourceMapFunction } from "../sourcemap";

type Props = {
	config: Config;
	accountId: string | undefined;
	entry: Entry;
	rules: Config["rules"];
	name: string;
	legacyEnv: boolean | undefined;
	env: string | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	assetsOptions: AssetsOptions | undefined;
	vars: Record<string, string> | undefined;
	defines: Record<string, string> | undefined;
	alias: Record<string, string> | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	isWorkersSite: boolean;
	minify: boolean | undefined;
	uploadSourceMaps: boolean | undefined;
	nodeCompat: boolean | undefined;
	outDir: string | undefined;
	dryRun: boolean | undefined;
	noBundle: boolean | undefined;
	keepVars: boolean | undefined;
	projectRoot: string | undefined;
	experimentalAutoCreate: boolean;

	tag: string | undefined;
	message: string | undefined;
};

const scriptStartupErrorRegex = /startup/i;

function errIsScriptSize(err: unknown): err is { code: 10027 } {
	if (!err) {
		return false;
	}

	// 10027 = workers.api.error.script_too_large
	if ((err as { code: number }).code === 10027) {
		return true;
	}

	return false;
}

function errIsStartupErr(err: unknown): err is ParseError & { code: 10021 } {
	if (!err) {
		return false;
	}

	// 10021 = validation error
	// no explicit error code for more granular errors than "invalid script"
	// but the error will contain a string error message directly from the
	// validator.
	// the error always SHOULD look like "Script startup exceeded CPU limit."
	// (or the less likely "Script startup exceeded memory limits.")
	if (
		(err as { code: number }).code === 10021 &&
		err instanceof ParseError &&
		scriptStartupErrorRegex.test(err.notes[0]?.text)
	) {
		return true;
	}

	return false;
}

export const versionsUploadCommand = createCommand({
	metadata: {
		description: "Uploads your Worker code and config as a new Version",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		},
		bundle: {
			describe: "Run wrangler's compilation step before publishing",
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
			describe: "Use the latest version of the Worker runtime",
			type: "boolean",
			default: false,
		},
		assets: {
			describe: "Static assets to be served. Replaces Workers Sites.",
			type: "string",
			requiresArg: true,
		},
		format: {
			choices: ["modules", "service-worker"] as const,
			describe: "Choose an entry type",
			deprecated: true,
			hidden: true,
		},
		"legacy-assets": {
			describe: "Static assets to be served",
			type: "string",
			requiresArg: true,
			deprecated: true,
			hidden: true,
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
		"upload-source-maps": {
			describe:
				"Include source maps when uploading this Worker Gradual Rollouts Version.",
			type: "boolean",
		},
		"node-compat": {
			describe: "Enable Node.js compatibility",
			type: "boolean",
		},
		"dry-run": {
			describe: "Don't actually deploy",
			type: "boolean",
		},
		tag: {
			describe: "A tag for this Worker Gradual Rollouts Version",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe:
				"A descriptive message for this Worker Gradual Rollouts Version",
			type: "string",
			requiresArg: true,
		},
		"experimental-auto-create": {
			describe: "Automatically provision draft bindings with new resources",
			type: "boolean",
			default: true,
			hidden: true,
			alias: "x-auto-create",
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: false,
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
		}),
	},
	handler: async function versionsUploadHandler(args, { config }) {
		const entry = await getEntry(args, config, "versions upload");
		metrics.sendMetricsEvent(
			"upload worker version",
			{
				usesTypeScript: /\.tsx?$/.test(entry.file),
			},
			{
				sendMetrics: config.send_metrics,
			}
		);

		if (args.site || config.site) {
			throw new UserError(
				"Workers Sites does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead."
			);
		}
		if (args.legacyAssets || config.legacy_assets) {
			throw new UserError(
				"Legacy assets does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead."
			);
		}

		if (config.workflows?.length) {
			logger.once.warn("Workflows is currently in open beta.");
		}

		validateAssetsArgsAndConfig(
			{
				// given that legacyAssets and sites are not supported by
				// `wrangler versions upload` pass them as undefined to
				// skip the corresponding mutual exclusivity validation
				legacyAssets: undefined,
				site: undefined,
				assets: args.assets,
				script: args.script,
			},
			config
		);

		const assetsOptions = getAssetsOptions(args, config);

		if (args.latest) {
			logger.warn(
				`Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your ${configFileName(config.configPath)} file.\n`
			);
		}

		const cliVars = collectKeyValues(args.var);
		const cliDefines = collectKeyValues(args.define);
		const cliAlias = collectKeyValues(args.alias);

		const accountId = args.dryRun ? undefined : await requireAuth(config);
		const name = getScriptName(args, config);

		assert(
			name,
			'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
		);

		if (!args.dryRun) {
			assert(accountId, "Missing account ID");
			await verifyWorkerMatchesCITag(accountId, name, config.configPath);
		}

		if (!args.dryRun) {
			await standardPricingWarning(config);
		}
		const { versionId, workerTag, versionPreviewUrl } = await versionsUpload({
			config,
			accountId,
			name,
			rules: getRules(config),
			entry,
			legacyEnv: isLegacyEnv(config),
			env: args.env,
			compatibilityDate: args.latest
				? new Date().toISOString().substring(0, 10)
				: args.compatibilityDate,
			compatibilityFlags: args.compatibilityFlags,
			vars: cliVars,
			defines: cliDefines,
			alias: cliAlias,
			jsxFactory: args.jsxFactory,
			jsxFragment: args.jsxFragment,
			tsconfig: args.tsconfig,
			assetsOptions,
			minify: args.minify,
			uploadSourceMaps: args.uploadSourceMaps,
			nodeCompat: args.nodeCompat,
			isWorkersSite: Boolean(args.site || config.site),
			outDir: args.outdir,
			dryRun: args.dryRun,
			noBundle: !(args.bundle ?? !config.no_bundle),
			keepVars: false,
			projectRoot: entry.projectRoot,
			tag: args.tag,
			message: args.message,
			experimentalAutoCreate: args.experimentalAutoCreate,
		});

		writeOutput({
			type: "version-upload",
			version: 1,
			worker_name: name ?? null,
			worker_tag: workerTag,
			version_id: versionId,
			preview_url: versionPreviewUrl,
		});
	},
});

async function standardPricingWarning(config: Config) {
	if (config.usage_model !== undefined) {
		logger.warn(
			`The \`usage_model\` defined in your ${configFileName(config.configPath)} file is deprecated and no longer used. Visit our developer docs for details: https://developers.cloudflare.com/workers/wrangler/configuration/#usage-model`
		);
	}
}

export default async function versionsUpload(props: Props): Promise<{
	versionId: string | null;
	workerTag: string | null;
	versionPreviewUrl?: string | undefined;
}> {
	// TODO: warn if git/hg has uncommitted changes
	const { config, accountId, name } = props;
	let versionId: string | null = null;
	let workerTag: string | null = null;

	if (accountId && name) {
		try {
			const {
				default_environment: { script },
			} = await fetchResult<{
				default_environment: {
					script: {
						tag: string;
						last_deployed_from: "dash" | "wrangler" | "api";
					};
				};
			}>(
				`/accounts/${accountId}/workers/services/${name}` // TODO(consider): should this be a /versions endpoint?
			);

			workerTag = script.tag;

			if (script.last_deployed_from === "dash") {
				logger.warn(
					`You are about to upload a Worker Version that was last published via the Cloudflare Dashboard.\nEdits that have been made via the dashboard will be overridden by your local code and config.`
				);
				if (!(await confirm("Would you like to continue?"))) {
					return {
						versionId,
						workerTag,
					};
				}
			} else if (script.last_deployed_from === "api") {
				logger.warn(
					`You are about to upload a Workers Version that was last updated via the API.\nEdits that have been made via the API will be overridden by your local code and config.`
				);
				if (!(await confirm("Would you like to continue?"))) {
					return {
						versionId,
						workerTag,
					};
				}
			}
		} catch (e) {
			// code: 10090, message: workers.api.error.service_not_found
			// is thrown from the above fetchResult on the first deploy of a Worker
			if ((e as { code?: number }).code !== 10090) {
				throw e;
			}
		}
	}

	if (!(props.compatibilityDate || config.compatibility_date)) {
		const compatibilityDateStr = `${new Date().getFullYear()}-${(
			new Date().getMonth() +
			1 +
			""
		).padStart(2, "0")}-${(new Date().getDate() + "").padStart(2, "0")}`;

		throw new UserError(`A compatibility_date is required when uploading a Worker Version. Add the following to your ${configFileName(config.configPath)} file:
    \`\`\`
	${(formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath), false)}
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`);
	}

	const jsxFactory = props.jsxFactory || config.jsx_factory;
	const jsxFragment = props.jsxFragment || config.jsx_fragment;

	const minify = props.minify ?? config.minify;

	const nodejsCompatMode = validateNodeCompatMode(
		props.compatibilityDate ?? config.compatibility_date,
		props.compatibilityFlags ?? config.compatibility_flags,
		{
			nodeCompat: props.nodeCompat ?? config.node_compat,
			noBundle: props.noBundle ?? config.no_bundle,
		}
	);

	const compatibilityFlags =
		props.compatibilityFlags ?? config.compatibility_flags;

	// Warn if user tries minify or node-compat with no-bundle
	if (props.noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}

	const scriptName = props.name;

	if (config.site && !config.site.bucket) {
		throw new UserError(
			"A [site] definition requires a `bucket` field with a path to the site's assets directory."
		);
	}

	if (props.outDir) {
		// we're using a custom output directory,
		// so let's first ensure it exists
		mkdirSync(props.outDir, { recursive: true });
		// add a README
		const readmePath = path.join(props.outDir, "README.md");
		writeFileSync(
			readmePath,
			`This folder contains the built output assets for the worker "${scriptName}" generated at ${new Date().toISOString()}.`
		);
	}

	const destination =
		props.outDir ?? getWranglerTmpDir(props.projectRoot, "deploy");

	const start = Date.now();
	const workerName = scriptName;
	const workerUrl = `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const { format } = props.entry;

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`
		);
	}

	let hasPreview = false;

	try {
		if (props.noBundle) {
			// if we're not building, let's just copy the entry to the destination directory
			const destinationDir =
				typeof destination === "string" ? destination : destination.path;
			mkdirSync(destinationDir, { recursive: true });
			writeFileSync(
				path.join(destinationDir, path.basename(props.entry.file)),
				readFileSync(props.entry.file, "utf-8")
			);
		}

		const entryDirectory = path.dirname(props.entry.file);
		const moduleCollector = createModuleCollector({
			wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
				entryDirectory,
				props.entry.file
			),
			entry: props.entry,
			// `moduleCollector` doesn't get used when `props.noBundle` is set, so
			// `findAdditionalModules` always defaults to `false`
			findAdditionalModules: config.find_additional_modules ?? false,
			rules: props.rules,
		});
		const uploadSourceMaps =
			props.uploadSourceMaps ?? config.upload_source_maps;

		const {
			modules,
			dependencies,
			resolvedEntryPointPath,
			bundleType,
			...bundle
		} = props.noBundle
			? await noBundleWorker(props.entry, props.rules, props.outDir)
			: await bundleWorker(
					props.entry,
					typeof destination === "string" ? destination : destination.path,
					{
						bundle: true,
						additionalModules: [],
						moduleCollector,
						serveLegacyAssetsFromWorker: false,
						doBindings: config.durable_objects.bindings,
						workflowBindings: config.workflows,
						jsxFactory,
						jsxFragment,
						tsconfig: props.tsconfig ?? config.tsconfig,
						minify,
						sourcemap: uploadSourceMaps,
						nodejsCompatMode,
						define: { ...config.define, ...props.defines },
						alias: { ...config.alias, ...props.alias },
						checkFetch: false,
						legacyAssets: config.legacy_assets,
						mockAnalyticsEngineDatasets: [],
						// enable the cache when publishing
						bypassAssetCache: false,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "deploy",
						local: false,
						projectRoot: props.projectRoot,
						defineNavigatorUserAgent: isNavigatorDefined(
							props.compatibilityDate ?? config.compatibility_date,
							props.compatibilityFlags ?? config.compatibility_flags
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
		const migrations = !props.dryRun
			? await getMigrationsToUpload(scriptName, {
					accountId,
					config,
					legacyEnv: props.legacyEnv,
					env: props.env,
					dispatchNamespace: undefined,
				})
			: undefined;

		// Upload assets if assets is being used
		const assetsJwt =
			props.assetsOptions && !props.dryRun
				? await syncAssets(accountId, props.assetsOptions.directory, scriptName)
				: undefined;

		const bindings = getBindings({
			...config,
			vars: { ...config.vars, ...props.vars },
		});

		// The upload API only accepts an empty string or no specified placement for the "off" mode.
		const placement: CfPlacement | undefined =
			config.placement?.mode === "smart"
				? { mode: "smart", hint: config.placement.hint }
				: undefined;

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
			bindings,
			migrations,
			modules,
			sourceMaps: uploadSourceMaps
				? loadSourceMaps(main, modules, bundle)
				: undefined,
			compatibility_date: props.compatibilityDate ?? config.compatibility_date,
			compatibility_flags: compatibilityFlags,
			keepVars: false, // the wrangler.toml should be the source-of-truth for vars
			keepSecrets: true, // until wrangler.toml specifies secret bindings, we need to inherit from the previous Worker Version
			placement,
			tail_consumers: config.tail_consumers,
			limits: config.limits,
			annotations: {
				"workers/message": props.message,
				"workers/tag": props.tag,
			},
			assets:
				props.assetsOptions && assetsJwt
					? {
							jwt: assetsJwt,
							routingConfig: props.assetsOptions.routingConfig,
							assetConfig: props.assetsOptions.assetConfig,
						}
					: undefined,
			logpush: undefined, // both logpush and observability are not supported in versions upload
			observability: undefined,
		};

		await printBundleSize(
			{ name: path.basename(resolvedEntryPointPath), content: content },
			modules
		);

		// mask anything that was overridden in cli args
		// so that we don't log potential secrets into the terminal
		const maskedVars = { ...bindings.vars };
		for (const key of Object.keys(maskedVars)) {
			if (maskedVars[key] !== config.vars[key]) {
				// This means it was overridden in cli args
				// so let's mask it
				maskedVars[key] = "(hidden)";
			}
		}

		if (props.dryRun) {
			printBindings({ ...bindings, vars: maskedVars });
		} else {
			assert(accountId, "Missing accountId");
			if (getFlag("RESOURCES_PROVISION")) {
				await provisionBindings(
					bindings,
					accountId,
					scriptName,
					props.experimentalAutoCreate,
					props.config
				);
			}

			await ensureQueuesExistByConfig(config);
			let bindingsPrinted = false;

			// Upload the version.
			try {
				const body = createWorkerUploadForm(worker);

				const result = await retryOnAPIFailure(async () =>
					fetchResult<{
						id: string;
						startup_time_ms: number;
						metadata: {
							has_preview: boolean;
						};
					}>(`${workerUrl}/versions`, {
						method: "POST",
						body,
						headers: await getMetricsUsageHeaders(config.send_metrics),
					})
				);

				logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
				bindingsPrinted = true;
				printBindings({ ...bindings, vars: maskedVars });
				versionId = result.id;
				hasPreview = result.metadata.has_preview;
			} catch (err) {
				if (!bindingsPrinted) {
					printBindings({ ...bindings, vars: maskedVars });
				}

				helpIfErrorIsSizeOrScriptStartup(err, dependencies);

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
		}
	} finally {
		if (typeof destination !== "string") {
			// this means we're using a temp dir,
			// so let's clean up before we proceed
			destination.remove();
		}
	}

	if (props.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return { versionId, workerTag };
	}
	if (!accountId) {
		throw new UserError("Missing accountId");
	}

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));
	logger.log("Worker Version ID:", versionId);

	let versionPreviewUrl: string | undefined = undefined;

	if (versionId && hasPreview) {
		const { previews_enabled: previews_available_on_subdomain } =
			await fetchResult<{
				previews_enabled: boolean;
			}>(`${workerUrl}/subdomain`);

		if (previews_available_on_subdomain) {
			const userSubdomain = await getWorkersDevSubdomain(
				accountId,
				config.configPath
			);
			const shortVersion = versionId.slice(0, 8);
			versionPreviewUrl = `https://${shortVersion}-${workerName}.${userSubdomain}.workers.dev`;
			logger.log(`Version Preview URL: ${versionPreviewUrl}`);
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

	return { versionId, workerTag, versionPreviewUrl };
}

function helpIfErrorIsSizeOrScriptStartup(
	err: unknown,
	dependencies: { [path: string]: { bytesInOutput: number } }
) {
	if (errIsScriptSize(err)) {
		printOffendingDependencies(dependencies);
	} else if (errIsStartupErr(err)) {
		const youFailed =
			"Your Worker failed validation because it exceeded startup limits.";
		const heresWhy =
			"To ensure fast responses, we place constraints on Worker startup -- like how much CPU it can use, or how long it can take.";
		const heresTheProblem =
			"Your Worker failed validation, which means it hit one of these startup limits.";
		const heresTheSolution =
			"Try reducing the amount of work done during startup (outside the event handler), either by removing code or relocating it inside the event handler.";
		logger.warn(
			[youFailed, heresWhy, heresTheProblem, heresTheSolution].join("\n")
		);
	}
}

function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

async function noBundleWorker(
	entry: Entry,
	rules: Rule[],
	outDir: string | undefined
) {
	const modules = await findAdditionalModules(entry, rules);
	if (outDir) {
		await writeAdditionalModules(modules, outDir);
	}

	return {
		modules,
		dependencies: {} as { [path: string]: { bytesInOutput: number } },
		resolvedEntryPointPath: entry.file,
		bundleType: getBundleType(entry.format),
	};
}
