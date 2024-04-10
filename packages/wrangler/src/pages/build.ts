import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path, {
	basename,
	dirname,
	relative,
	resolve as resolvePath,
} from "node:path";
import { createUploadWorkerBundleContents } from "../api/pages/create-worker-bundle-contents";
import { readConfig } from "../config";
import { writeAdditionalModules } from "../deployment-bundle/find-additional-modules";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { parseJSON } from "../parse";
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
import type { Config } from "../config";
import type { BundleResult } from "../deployment-bundle/bundle";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

type BuildMetadata = {
	wrangler_config_hash: string;
	build_output_directory: string;
};

export type PagesBuildArgs = StrictYargsOptionsToInterface<typeof Options>;

export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("directory", {
			type: "string",
			default: "functions",
			description: "The directory of Pages Functions",
		})
		.options({
			outfile: {
				type: "string",
				description: "The location of the output Worker script",
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
				describe: "Enable Node.js compatibility",
				default: false,
				type: "boolean",
				hidden: true,
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
			bindings: {
				type: "string",
				describe:
					"Bindings used in Functions (used to register beta product shims)",
				deprecated: true,
				hidden: true,
			},
		});
}

export const Handler = async (args: PagesBuildArgs) => {
	const validatedArgs = await validateArgs(args);

	let bundle: BundleResult | undefined = undefined;
	let workerBundleContents: Buffer | undefined = undefined;

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
			nodejsCompat,
			legacyNodeCompat,
			defineNavigatorUserAgent,
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
				legacyNodeCompat,
				nodejsCompat,
				routesOutputPath,
				local: false,
				defineNavigatorUserAgent,
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
			nodejsCompat,
			legacyNodeCompat,
			workerScriptPath,
			workerBundlePath,
			defineNavigatorUserAgent,
		} = validatedArgs;

		/**
		 * Prioritise `_worker.bundle`, `_worker.js`, functions dir, in that order
		 */
		if (workerBundlePath) {
			workerBundleContents = await readFile(workerBundlePath);
		} else if (workerScriptPath) {
			if (lstatSync(workerScriptPath).isDirectory()) {
				bundle = await produceWorkerBundleForWorkerJSDirectory({
					workerJSDirectory: workerScriptPath,
					bundle: true,
					buildOutputDirectory,
					nodejsCompat,
					defineNavigatorUserAgent,
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
					sourcemap,
					watch,
					nodejsCompat,
					defineNavigatorUserAgent,
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
					sourcemap,
					fallbackService,
					watch,
					plugin,
					buildOutputDirectory,
					legacyNodeCompat,
					nodejsCompat,
					routesOutputPath,
					local: false,
					defineNavigatorUserAgent,
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
			if (workerBundleContents) {
				await writeFile(
					path.join(outdir, "_worker.bundle"),
					workerBundleContents
				);
			} else if (bundle) {
				await writeAdditionalModules(bundle.modules, outdir);
			} else {
				// This should never happen
				throw new FatalError("Nothing to write to --outdir");
			}
		}

		if (outfile) {
			if (bundle && !workerBundleContents) {
				workerBundleContents = Buffer.from(
					await (
						await createUploadWorkerBundleContents(
							bundle as BundleResult,
							config
						)
					).arrayBuffer()
				);
			}
			if (!workerBundleContents) {
				// This should never happen
				throw new FatalError("Nothing to write to --outfile");
			}

			mkdirSync(dirname(outfile), { recursive: true });
			writeFileSync(outfile, workerBundleContents);
		}
		if (buildMetadataPath && buildMetadata) {
			writeFileSync(buildMetadataPath, JSON.stringify(buildMetadata));
		}
	}

	await metrics.sendMetricsEvent("build pages functions");
};

type WorkerBundleArgs = Omit<PagesBuildArgs, "nodeCompat"> & {
	plugin: false;
	buildOutputDirectory: string;
	legacyNodeCompat: boolean;
	nodejsCompat: boolean;
	defineNavigatorUserAgent: boolean;
	workerScriptPath: string;
	workerBundlePath: string;
	config: Config | undefined;
	buildMetadata: BuildMetadata | undefined;
};
type PluginArgs = Omit<
	PagesBuildArgs,
	"buildOutputDirectory" | "bindings" | "nodeCompat"
> & {
	plugin: true;
	outdir: string;
	legacyNodeCompat: boolean;
	nodejsCompat: boolean;
	defineNavigatorUserAgent: boolean;
};
async function maybeReadPagesConfig(
	args: PagesBuildArgs
): Promise<(Config & { hash: string }) | undefined> {
	if (!args.projectDirectory || !args.buildMetadataPath) {
		return;
	}
	const configPath = path.resolve(args.projectDirectory, "wrangler.toml");
	// Fail early if the config file doesn't exist
	if (!existsSync(configPath)) {
		return undefined;
	}
	try {
		const config = readConfig(
			configPath,
			{
				...args,
				// eslint-disable-next-line turbo/no-undeclared-env-vars
				env: process.env.PAGES_ENVIRONMENT,
			},
			true
		);

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

const validateArgs = async (args: PagesBuildArgs): Promise<ValidatedArgs> => {
	const config = await maybeReadPagesConfig(args);

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

	const { nodeCompat: legacyNodeCompat, ...argsExceptNodeCompat } = args;
	if (legacyNodeCompat) {
		console.warn(
			"Enabling Node.js compatibility mode for builtins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
		);
	}
	const nodejsCompat = !!args.compatibilityFlags?.includes("nodejs_compat");
	const defineNavigatorUserAgent = isNavigatorDefined(
		args.compatibilityDate,
		args.compatibilityFlags
	);
	if (legacyNodeCompat && nodejsCompat) {
		throw new UserError(
			"The `nodejs_compat` compatibility flag cannot be used in conjunction with the legacy `--node-compat` flag. If you want to use the Workers runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command."
		);
	}

	let workerScriptPath: string | undefined;
	let workerBundlePath: string | undefined;

	if (args.buildOutputDirectory) {
		const prospectiveWorkerBundlePath = resolvePath(
			args.buildOutputDirectory,
			"_worker.bundle"
		);

		const prospectiveWorkerScriptPath = resolvePath(
			args.buildOutputDirectory,
			"_worker.js"
		);

		const foundWorkerBundle = existsSync(prospectiveWorkerBundlePath);

		const foundWorkerScript = existsSync(prospectiveWorkerScriptPath);
		if (foundWorkerBundle) {
			workerBundlePath = prospectiveWorkerBundlePath;
		} else if (foundWorkerScript) {
			workerScriptPath = prospectiveWorkerScriptPath;
		} else if (
			!foundWorkerScript &&
			!foundWorkerBundle &&
			!existsSync(args.directory)
		) {
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

	// The build metadata for this build (a hash of the config file it was based on, and the output directory that was used) is usually generated from wrangler.toml
	// However, frameworks may want to allow users to use a completely different config file, and so may want to fully generate a `_build-metadata.json` file themselves
	// This is an advanced use case, and should go along with a custom `_worker.bundle` file. The vast majority of users won't need to cutomise this!
	let buildMetadata: BuildMetadata | undefined;

	if (args.buildOutputDirectory) {
		const prospectiveBuildMetadataPath = resolvePath(
			args.buildOutputDirectory,
			"_build-metadata.json"
		);
		if (existsSync(prospectiveBuildMetadataPath)) {
			const maybeBuildMetadata = parseJSON<{
				wrangler_config_hash?: string;
				build_output_directory?: string;
			}>(await readFile(prospectiveBuildMetadataPath, "utf8"));

			// Ensure we only add known properties to the build metadata
			buildMetadata =
				maybeBuildMetadata?.wrangler_config_hash &&
				maybeBuildMetadata?.build_output_directory
					? {
							wrangler_config_hash: maybeBuildMetadata.wrangler_config_hash,
							build_output_directory: maybeBuildMetadata.build_output_directory,
					  }
					: undefined;
		} else if (
			config &&
			args.projectDirectory &&
			config.pages_build_output_dir
		) {
			buildMetadata = {
				wrangler_config_hash: config.hash,
				build_output_directory: path.relative(
					args.projectDirectory,
					config.pages_build_output_dir
				),
			};
		}
	}

	return {
		...argsExceptNodeCompat,
		workerScriptPath,
		workerBundlePath,
		nodejsCompat,
		legacyNodeCompat,
		defineNavigatorUserAgent,
		config,
		buildMetadata,
	} as ValidatedArgs;
};
