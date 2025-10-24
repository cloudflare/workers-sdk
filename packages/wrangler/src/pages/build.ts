import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path, {
	basename,
	dirname,
	relative,
	resolve as resolvePath,
} from "node:path";
import {
	FatalError,
	findWranglerConfig,
	UserError,
} from "@cloudflare/workers-utils";
import { createUploadWorkerBundleContents } from "../api/pages/create-worker-bundle-contents";
import { readPagesConfig } from "../config";
import { createCommand } from "../core/create-command";
import { shouldCheckFetch } from "../deployment-bundle/bundle";
import { writeAdditionalModules } from "../deployment-bundle/find-additional-modules";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { buildFunctions } from "./buildFunctions";
import {
	EXIT_CODE_FUNCTIONS_NO_ROUTES_ERROR,
	EXIT_CODE_FUNCTIONS_NOTHING_TO_BUILD_ERROR,
	EXIT_CODE_INVALID_PAGES_CONFIG,
	FunctionsNoRoutesError,
	getFunctionsNoRoutesWarning,
} from "./errors";
import {
	buildRawWorker,
	produceWorkerBundleForWorkerJSDirectory,
} from "./functions/buildWorker";
import type { BundleResult } from "../deployment-bundle/bundle";
import type { Config } from "@cloudflare/workers-utils";
import type { NodeJSCompatMode } from "miniflare";

export const pagesFunctionsBuildCommand = createCommand({
	metadata: {
		description: "Compile a folder of Pages Functions into a single Worker",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		directory: {
			type: "string",
			default: "functions",
			description: "The directory of Pages Functions",
		},
		outfile: {
			type: "string",
			description: "The location of the output Worker script",
			deprecated: true,
		},
		outdir: {
			type: "string",
			description: "Output directory for the bundled Worker",
		},
		"output-config-path": {
			type: "string",
			description: "The location for the output config file",
		},
		"build-metadata-path": {
			type: "string",
			description: "The location for the build metadata file",
		},
		"project-directory": {
			type: "string",
			description: "The location of the Pages project",
		},
		"output-routes-path": {
			type: "string",
			description: "The location for the output _routes.json file",
		},
		minify: {
			type: "boolean",
			default: false,
			description: "Minify the output Worker script",
		},
		sourcemap: {
			type: "boolean",
			default: false,
			description: "Generate a sourcemap for the output Worker script",
		},
		"fallback-service": {
			type: "string",
			default: "ASSETS",
			description:
				"The service to fallback to at the end of the `next` chain. Setting to '' will fallback to the global `fetch`.",
		},
		watch: {
			type: "boolean",
			default: false,
			description:
				"Watch for changes to the functions and automatically rebuild the Worker script",
		},
		plugin: {
			type: "boolean",
			default: false,
			description: "Build a plugin rather than a Worker script",
		},
		"build-output-directory": {
			type: "string",
			description: "The directory to output static assets to",
		},
		"node-compat": {
			type: "boolean",
			default: false,
			description: "Enable Node.js compatibility",
			hidden: true,
			deprecated: true,
		},
		"compatibility-date": {
			type: "string",
			description: "Date to use for compatibility checks",
		},
		"compatibility-flags": {
			description: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			requiresArg: true,
			array: true,
		},
		bindings: {
			type: "string",
			description:
				"Bindings used in Functions (used to register beta product shims)",
			deprecated: true,
			hidden: true,
		},
		external: {
			description: "A list of module imports to exclude from bundling",
			type: "string",
			array: true,
		},
		metafile: {
			describe:
				"Path to output build metadata from esbuild. If flag is used without a path, defaults to 'bundle-meta.json' inside the directory specified by --outdir.",
			type: "string",
			coerce: (v: string) => (!v ? true : v),
		},
	},
	positionalArgs: ["directory"],
	async handler(args) {
		const validatedArgs = await validateArgs(args);

		let bundle: BundleResult | undefined = undefined;

		if (validatedArgs.plugin) {
			const {
				directory,
				outfile,
				outdir,
				outputConfigPath,
				outputRoutesPath: routesOutputPath,
				minify,
				sourcemap,
				fallbackService,
				watch,
				plugin,
				nodejsCompatMode,
				defineNavigatorUserAgent,
				checkFetch,
				external,
				metafile,
			} = validatedArgs;

			try {
				/**
				 * `buildFunctions` builds `/functions`, but doesn't give us the bundle
				 * we want to return, which includes the external dependencies (like wasm,
				 * binary, text). Let's output that build result to memory and only write
				 * to disk once we have the final bundle
				 */
				bundle = await buildFunctions({
					outfile,
					outdir,
					outputConfigPath,
					functionsDirectory: directory,
					minify,
					sourcemap,
					fallbackService,
					// This only watches already existing files using the esbuild watching mechanism
					// it will not watch new files that are added to the functions directory!
					watch,
					plugin,
					nodejsCompatMode,
					routesOutputPath,
					local: false,
					defineNavigatorUserAgent,
					checkFetch,
					external,
					metafile,
				});
			} catch (e) {
				if (e instanceof FunctionsNoRoutesError) {
					throw new FatalError(
						getFunctionsNoRoutesWarning(directory),
						EXIT_CODE_FUNCTIONS_NO_ROUTES_ERROR
					);
				} else {
					throw e;
				}
			}

			if (outfile && outfile !== bundle.resolvedEntryPointPath) {
				writeFileSync(
					outfile,
					`export { default } from './${relative(
						dirname(outfile),
						bundle.resolvedEntryPointPath
					)}'`
				);
			}
		} else {
			const {
				config,
				buildMetadataPath,
				buildMetadata,
				directory,
				outfile,
				outdir,
				outputConfigPath,
				outputRoutesPath: routesOutputPath,
				minify,
				sourcemap,
				fallbackService,
				watch,
				plugin,
				buildOutputDirectory,
				nodejsCompatMode,
				workerScriptPath,
				defineNavigatorUserAgent,
				checkFetch,
				external,
				metafile,
			} = validatedArgs;

			/**
			 * prioritize building `_worker.js` over Pages Functions, if both exist
			 * and if we were able to resolve _worker.js
			 */
			if (workerScriptPath) {
				if (lstatSync(workerScriptPath).isDirectory()) {
					bundle = await produceWorkerBundleForWorkerJSDirectory({
						workerJSDirectory: workerScriptPath,
						bundle: true,
						buildOutputDirectory,
						nodejsCompatMode,
						defineNavigatorUserAgent,
						checkFetch,
						sourceMaps: config?.upload_source_maps ?? sourcemap,
					});
				} else {
					/**
					 * `buildRawWorker` builds `_worker.js`, but doesn't give us the bundle
					 * we want to return, which includes the external dependencies (like wasm,
					 * binary, text). Let's output that build result to memory and only write
					 * to disk once we have the final bundle
					 */
					bundle = await buildRawWorker({
						workerScriptPath,
						outdir,
						directory: buildOutputDirectory,
						local: false,
						sourcemap: config?.upload_source_maps ?? sourcemap,
						watch,
						nodejsCompatMode,
						defineNavigatorUserAgent,
						checkFetch,
						externalModules: external,
					});
				}
			} else {
				try {
					/**
					 * `buildFunctions` builds `/functions`, but doesn't give us the bundle
					 * we want to return, which includes the external dependencies (like wasm,
					 * binary, text). Let's output that build result to memory and only write
					 * to disk once we have the final bundle
					 */
					bundle = await buildFunctions({
						outdir,
						outputConfigPath,
						functionsDirectory: directory,
						minify,
						sourcemap: config?.upload_source_maps ?? sourcemap,
						fallbackService,
						watch,
						plugin,
						buildOutputDirectory,
						nodejsCompatMode,
						routesOutputPath,
						local: false,
						defineNavigatorUserAgent,
						checkFetch,
						external,
						metafile,
					});
				} catch (e) {
					if (e instanceof FunctionsNoRoutesError) {
						throw new FatalError(
							getFunctionsNoRoutesWarning(directory),
							EXIT_CODE_FUNCTIONS_NO_ROUTES_ERROR
						);
					} else {
						throw e;
					}
				}
			}

			if (outdir) {
				await writeAdditionalModules(bundle.modules, outdir);
			}

			if (outfile) {
				const workerBundleContents = await createUploadWorkerBundleContents(
					bundle as BundleResult,
					config
				);

				mkdirSync(dirname(outfile), { recursive: true });
				writeFileSync(
					outfile,
					Buffer.from(await workerBundleContents.arrayBuffer())
				);
			}
			if (buildMetadataPath && buildMetadata) {
				writeFileSync(buildMetadataPath, JSON.stringify(buildMetadata));
			}
		}

		metrics.sendMetricsEvent("build pages functions");
	},
});

type WorkerBundleArgs = Omit<
	typeof pagesFunctionsBuildCommand.args,
	"nodeCompat"
> & {
	plugin: false;
	buildOutputDirectory: string;
	nodejsCompatMode: NodeJSCompatMode;
	defineNavigatorUserAgent: boolean;
	checkFetch: boolean;
	workerScriptPath: string;
	config: Config | undefined;
	buildMetadata:
		| {
				wrangler_config_hash: string;
				build_output_directory: string;
		  }
		| undefined;
};
type PluginArgs = Omit<
	typeof pagesFunctionsBuildCommand.args,
	"buildOutputDirectory" | "bindings" | "nodeCompat"
> & {
	plugin: true;
	outdir: string;
	nodejsCompatMode: NodeJSCompatMode;
	defineNavigatorUserAgent: boolean;
	checkFetch: boolean;
};
async function maybeReadPagesConfig(
	args: typeof pagesFunctionsBuildCommand.args
): Promise<(Config & { hash: string }) | undefined> {
	if (!args.projectDirectory || !args.buildMetadataPath) {
		return;
	}
	const { configPath } = findWranglerConfig(args.projectDirectory, {
		useRedirectIfAvailable: true,
	});
	// Fail early if the config file doesn't exist
	if (!configPath || !existsSync(configPath)) {
		return undefined;
	}
	try {
		const config = readPagesConfig({
			...args,
			config: configPath,
			// eslint-disable-next-line turbo/no-undeclared-env-vars
			env: process.env.PAGES_ENVIRONMENT,
		});

		return {
			...config,
			hash: createHash("sha256")
				.update(await readFile(configPath))
				.digest("hex"),
		};
	} catch (e) {
		if (e instanceof FatalError && e.code === EXIT_CODE_INVALID_PAGES_CONFIG) {
			return undefined;
		}
		throw e;
	}
}
type ValidatedArgs = WorkerBundleArgs | PluginArgs;

const validateArgs = async (
	args: typeof pagesFunctionsBuildCommand.args
): Promise<ValidatedArgs> => {
	const config = await maybeReadPagesConfig(args);

	if (args.nodeCompat) {
		throw new UserError(
			`The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.`
		);
	}

	if (args.outdir && args.outfile) {
		throw new FatalError(
			"Cannot specify both an `--outdir` and an `--outfile`.",
			1
		);
	}

	if (args.plugin) {
		if (args.outfile) {
			// Explicit old behavior. Encourage to migrate to `--outdir` instead.
			logger.warn(
				"Creating a Pages Plugin with `--outfile` is now deprecated. Please use `--outdir` instead."
			);

			args.outdir = dirname(resolvePath(args.outfile));
		} else if (!args.outfile && !args.outdir) {
			// Didn't specify `--outfile`, but didn't specify `--outdir` either. Implicit old behavior defaults. Encourage to migrate to `--outdir`.
			args.outfile ??= "_worker.js";
			args.outdir = ".";

			logger.warn(
				"Creating a Pages Plugin without `--outdir` is now deprecated. Please add an `--outdir` argument."
			);
		}

		if (args.bindings) {
			throw new FatalError(
				"The `--bindings` flag cannot be used when creating a Pages Plugin with `--plugin`.",
				1
			);
		}

		if (args.buildOutputDirectory) {
			throw new FatalError(
				"The `--build-output-directory` flag cannot be used when creating a Pages Plugin with `--plugin`.",
				1
			);
		}
	} else {
		if (!args.outdir) {
			args.outfile ??= "_worker.bundle";
		}

		args.buildOutputDirectory ??= args.outfile ? dirname(args.outfile) : ".";
	}

	args.buildOutputDirectory =
		config?.pages_build_output_dir ??
		(args.buildOutputDirectory
			? resolvePath(args.buildOutputDirectory)
			: undefined);

	if (args.outdir) {
		args.outdir = resolvePath(args.outdir);
	}
	if (args.outfile) {
		args.outfile = resolvePath(args.outfile);
	}

	const nodejsCompatMode = validateNodeCompatMode(
		args.compatibilityDate ?? config?.compatibility_date,
		args.compatibilityFlags ?? config?.compatibility_flags ?? [],
		{
			noBundle: config?.no_bundle,
		}
	);

	const defineNavigatorUserAgent = isNavigatorDefined(
		args.compatibilityDate,
		args.compatibilityFlags
	);

	const checkFetch = shouldCheckFetch(
		args.compatibilityDate,
		args.compatibilityFlags
	);

	let workerScriptPath: string | undefined;

	if (args.buildOutputDirectory) {
		const prospectiveWorkerScriptPath = resolvePath(
			args.buildOutputDirectory,
			"_worker.js"
		);

		const foundWorkerScript = existsSync(prospectiveWorkerScriptPath);

		if (foundWorkerScript) {
			workerScriptPath = prospectiveWorkerScriptPath;
		} else if (!foundWorkerScript && !existsSync(args.directory)) {
			throw new FatalError(
				`Could not find anything to build.
We first looked inside the build output directory (${basename(
					resolvePath(args.buildOutputDirectory)
				)}), then looked for the Functions directory (${basename(
					args.directory
				)}) but couldn't find anything to build.
	➤ If you are trying to build _worker.js, please make sure you provide the [--build-output-directory] containing your static files.
	➤ If you are trying to build Pages Functions, please make sure [directory] points to the location of your Functions files.`,
				EXIT_CODE_FUNCTIONS_NOTHING_TO_BUILD_ERROR
			);
		}
	} else if (!existsSync(args.directory)) {
		throw new FatalError(
			`Could not find anything to build.
We looked for the Functions directory (${basename(
				args.directory
			)}) but couldn't find anything to build.
	➤ Please make sure [directory] points to the location of your Functions files.`,
			EXIT_CODE_FUNCTIONS_NOTHING_TO_BUILD_ERROR
		);
	}

	return {
		...args,
		workerScriptPath,
		nodejsCompatMode,
		defineNavigatorUserAgent,
		checkFetch,
		config,
		buildMetadata:
			config && args.projectDirectory && config.pages_build_output_dir
				? {
						wrangler_config_hash: config.hash,
						build_output_directory: path.relative(
							args.projectDirectory,
							config.pages_build_output_dir
						),
					}
				: undefined,
	} as ValidatedArgs;
};
