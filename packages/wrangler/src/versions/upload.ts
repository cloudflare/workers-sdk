import assert from "node:assert";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { blue, gray } from "@cloudflare/cli/colors";
import { Response } from "undici";
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
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { confirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import {
	getCIGeneratePreviewAlias,
	getCIOverrideName,
	getWorkersCIBranchName,
} from "../environment-variables/misc-variables";
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
import { formatCompatibilityDate } from "../utils/compatibility-date";
import { helpIfErrorIsSizeOrScriptStartup } from "../utils/friendly-validator-errors";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import { printBindings } from "../utils/print-bindings";
import { retryOnAPIFailure } from "../utils/retry";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type { Entry } from "../deployment-bundle/entry";
import type { CfPlacement, CfWorkerInit } from "../deployment-bundle/worker";
import type { RetrieveSourceMapFunction } from "../sourcemap";
import type { FormData } from "undici";

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
	outDir: string | undefined;
	outFile: string | undefined;
	dryRun: boolean | undefined;
	noBundle: boolean | undefined;
	keepVars: boolean | undefined;
	projectRoot: string | undefined;
	experimentalAutoCreate: boolean;

	tag: string | undefined;
	message: string | undefined;
	previewAlias: string | undefined;
};

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
			describe: "Use the latest version of the Worker runtime",
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
			hidden: true,
			deprecated: true,
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
		"preview-alias": {
			describe: "Name of an alias for this Worker version",
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
			REMOTE_BINDINGS: args.experimentalRemoteBindings ?? false,
			DEPLOY_REMOTE_DIFF_CHECK: false,
		}),
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
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

		if (args.nodeCompat) {
			throw new UserError(
				`The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.`
			);
		}

		if (args.site || config.site) {
			throw new UserError(
				"Workers Sites does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead.",
				{ telemetryMessage: true }
			);
		}

		validateAssetsArgsAndConfig(
			{
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
				'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		const previewAlias =
			args.previewAlias ??
			(getCIGeneratePreviewAlias() === "true"
				? generatePreviewAlias(name)
				: undefined);

		if (!args.dryRun) {
			assert(accountId, "Missing account ID");
			await verifyWorkerMatchesCITag(
				config,
				accountId,
				name,
				config.configPath
			);
		}

		const { versionId, workerTag, versionPreviewUrl, versionPreviewAliasUrl } =
			await versionsUpload({
				config,
				accountId,
				name,
				rules: getRules(config),
				entry,
				legacyEnv: isLegacyEnv(config),
				env: args.env,
				compatibilityDate: args.latest
					? formatCompatibilityDate(new Date())
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
				isWorkersSite: Boolean(args.site || config.site),
				outDir: args.outdir,
				dryRun: args.dryRun,
				noBundle: !(args.bundle ?? !config.no_bundle),
				keepVars: false,
				projectRoot: entry.projectRoot,
				tag: args.tag,
				message: args.message,
				previewAlias: previewAlias,
				experimentalAutoCreate: args.experimentalAutoCreate,
				outFile: args.outfile,
			});

		writeOutput({
			type: "version-upload",
			version: 1,
			worker_name: name ?? null,
			worker_tag: workerTag,
			version_id: versionId,
			preview_url: versionPreviewUrl,
			preview_alias_url: versionPreviewAliasUrl,
			wrangler_environment: args.env,
			worker_name_overridden: workerNameOverridden,
		});
	},
});

export default async function versionsUpload(props: Props): Promise<{
	versionId: string | null;
	workerTag: string | null;
	versionPreviewUrl?: string | undefined;
	versionPreviewAliasUrl?: string | undefined;
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
				config,
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

	const compatibilityDate =
		props.compatibilityDate || config.compatibility_date;
	const compatibilityFlags =
		props.compatibilityFlags ?? config.compatibility_flags;

	if (!compatibilityDate) {
		const compatibilityDateStr = formatCompatibilityDate(new Date());

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
		compatibilityDate,
		compatibilityFlags,
		{
			noBundle: props.noBundle ?? config.no_bundle,
		}
	);

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
						doBindings: config.durable_objects.bindings,
						workflowBindings: config.workflows,
						jsxFactory,
						jsxFragment,
						tsconfig: props.tsconfig ?? config.tsconfig,
						minify,
						keepNames: config.keep_names ?? true,
						sourcemap: uploadSourceMaps,
						nodejsCompatMode,
						compatibilityDate,
						compatibilityFlags,
						define: { ...config.define, ...props.defines },
						alias: { ...config.alias, ...props.alias },
						checkFetch: false,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "deploy",
						local: false,
						projectRoot: props.projectRoot,
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
						metafile: undefined,
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
				? await syncAssets(
						config,
						accountId,
						props.assetsOptions.directory,
						scriptName
					)
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
			compatibility_date: compatibilityDate,
			compatibility_flags: compatibilityFlags,
			keepVars: false, // the wrangler.toml should be the source-of-truth for vars
			keepSecrets: true, // until wrangler.toml specifies secret bindings, we need to inherit from the previous Worker Version
			placement,
			tail_consumers: config.tail_consumers,
			limits: config.limits,
			annotations: {
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

		let workerBundle: FormData;

		if (props.dryRun) {
			workerBundle = createWorkerUploadForm(worker);
			printBindings({ ...bindings, vars: maskedVars }, config.tail_consumers);
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
			workerBundle = createWorkerUploadForm(worker);

			await ensureQueuesExistByConfig(config);
			let bindingsPrinted = false;

			// Upload the version.
			try {
				const result = await retryOnAPIFailure(async () =>
					fetchResult<{
						id: string;
						startup_time_ms: number;
						metadata: {
							has_preview: boolean;
						};
					}>(config, `${workerUrl}/versions`, {
						method: "POST",
						body: workerBundle,
						headers: await getMetricsUsageHeaders(config.send_metrics),
					})
				);

				logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
				bindingsPrinted = true;
				printBindings({ ...bindings, vars: maskedVars }, config.tail_consumers);
				versionId = result.id;
				hasPreview = result.metadata.has_preview;
			} catch (err) {
				if (!bindingsPrinted) {
					printBindings(
						{ ...bindings, vars: maskedVars },
						config.tail_consumers
					);
				}

				const message = await helpIfErrorIsSizeOrScriptStartup(
					err,
					dependencies,
					workerBundle,
					props.projectRoot
				);
				if (message) {
					logger.error(message);
				}

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
		if (props.outFile) {
			// we're using a custom output file,
			// so let's first ensure it's parent directory exists
			mkdirSync(path.dirname(props.outFile), { recursive: true });

			const serializedFormData = await new Response(workerBundle).arrayBuffer();

			writeFileSync(props.outFile, Buffer.from(serializedFormData));
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
	let versionPreviewAliasUrl: string | undefined = undefined;

	if (versionId && hasPreview) {
		const { previews_enabled: previews_available_on_subdomain } =
			await fetchResult<{
				previews_enabled: boolean;
			}>(config, `${workerUrl}/subdomain`);

		if (previews_available_on_subdomain) {
			const userSubdomain = await getWorkersDevSubdomain(
				config,
				accountId,
				config.configPath
			);
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

function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

// Constants for DNS label constraints and hash configuration
const MAX_DNS_LABEL_LENGTH = 63;
const HASH_LENGTH = 4;
const ALIAS_VALIDATION_REGEX = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/i;

/**
 * Sanitizes a branch name to create a valid DNS label alias.
 * Converts to lowercase, replaces invalid chars with dashes, removes consecutive dashes.
 */
function sanitizeBranchName(branchName: string): string {
	return branchName
		.replace(/[^a-zA-Z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}

/**
 * Gets the current branch name from CI environment or git.
 */
function getBranchName(): string | undefined {
	// Try CI environment variable first
	const ciBranchName = getWorkersCIBranchName();
	if (ciBranchName) {
		return ciBranchName;
	}

	// Fall back to git commands
	try {
		execSync(`git rev-parse --is-inside-work-tree`, { stdio: "ignore" });
		return execSync(`git rev-parse --abbrev-ref HEAD`).toString().trim();
	} catch {
		return undefined;
	}
}

/**
 * Creates a truncated alias with hash suffix when the branch name is too long.
 * Hash from original branch name to preserve uniqueness.
 */
function createTruncatedAlias(
	branchName: string,
	sanitizedAlias: string,
	availableSpace: number
): string | undefined {
	const spaceForHash = HASH_LENGTH + 1; // +1 for hyphen separator
	const maxPrefixLength = availableSpace - spaceForHash;

	if (maxPrefixLength < 1) {
		// Not enough space even with truncation
		return undefined;
	}

	const hash = createHash("sha256")
		.update(branchName)
		.digest("hex")
		.slice(0, HASH_LENGTH);

	const truncatedPrefix = sanitizedAlias.slice(0, maxPrefixLength);
	return `${truncatedPrefix}-${hash}`;
}

/**
 * Generates a preview alias based on the current git branch.
 * Alias must be <= 63 characters, alphanumeric + dashes only, and start with a letter.
 * Returns undefined if not in a git directory or requirements cannot be met.
 */
export function generatePreviewAlias(scriptName: string): string | undefined {
	const warnAndExit = () => {
		logger.warn(
			`Preview alias generation requested, but could not be autogenerated.`
		);
		return undefined;
	};

	const branchName = getBranchName();
	if (!branchName) {
		return warnAndExit();
	}

	const sanitizedAlias = sanitizeBranchName(branchName);

	// Validate the sanitized alias meets DNS label requirements
	if (!ALIAS_VALIDATION_REGEX.test(sanitizedAlias)) {
		return warnAndExit();
	}

	const availableSpace = MAX_DNS_LABEL_LENGTH - scriptName.length - 1;

	// If the sanitized alias fits within the remaining space, return it,
	// otherwise otherwise try truncation with hash suffixed
	if (sanitizedAlias.length <= availableSpace) {
		return sanitizedAlias;
	}

	const truncatedAlias = createTruncatedAlias(
		branchName,
		sanitizedAlias,
		availableSpace
	);

	return truncatedAlias || warnAndExit();
}
