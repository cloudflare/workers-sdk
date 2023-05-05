import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve as resolvePath } from "node:path";
import { createUploadWorkerBundleContents } from "../api/pages/create-worker-bundle-contents";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { buildFunctions } from "./buildFunctions";
import { isInPagesCI } from "./constants";
import {
	EXIT_CODE_FUNCTIONS_NOTHING_TO_BUILD_ERROR,
	EXIT_CODE_FUNCTIONS_NO_ROUTES_ERROR,
	FunctionsNoRoutesError,
	getFunctionsNoRoutesWarning,
} from "./errors";
import {
	buildRawWorker,
	traverseAndBuildWorkerJSDirectory,
} from "./functions/buildWorker";
import { pagesBetaWarning } from "./utils";
import type { BundleResult } from "../bundle";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

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
		})
		.epilogue(pagesBetaWarning);
}

export const Handler = async (args: PagesBuildArgs) => {
	if (!isInPagesCI) {
		// Beta message for `wrangler pages <commands>` usage
		logger.log(pagesBetaWarning);
	}

	const validatedArgs = validateArgs(args);

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
			nodejsCompat,
			legacyNodeCompat,
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
				watch,
				plugin,
				legacyNodeCompat,
				nodejsCompat,
				routesOutputPath,
				local: false,
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
			bindings,
			workerScriptPath,
		} = validatedArgs;

		let d1Databases: string[] | undefined = undefined;
		if (bindings) {
			try {
				const decodedBindings = JSON.parse(bindings);
				d1Databases = Object.keys(decodedBindings?.d1_databases || {});
			} catch {
				throw new FatalError("Could not parse a valid set of 'bindings'.", 1);
			}
		}

		/**
		 * prioritize building `_worker.js` over Pages Functions, if both exist
		 * and if we were able to resolve _worker.js
		 */
		if (workerScriptPath) {
			if (lstatSync(workerScriptPath).isDirectory()) {
				bundle = await traverseAndBuildWorkerJSDirectory({
					workerJSDirectory: workerScriptPath,
					buildOutputDirectory,
					d1Databases,
					nodejsCompat,
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
					betaD1Shims: d1Databases,
					nodejsCompat,
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
					d1Databases,
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

		if (outfile) {
			const workerBundleContents = await createUploadWorkerBundleContents(
				bundle as BundleResult
			);

			mkdirSync(dirname(outfile), { recursive: true });
			writeFileSync(
				outfile,
				Buffer.from(await workerBundleContents.arrayBuffer())
			);
		}
	}

	await metrics.sendMetricsEvent("build pages functions");
};

type WorkerBundleArgs = Omit<PagesBuildArgs, "nodeCompat"> & {
	plugin: false;
	buildOutputDirectory: string;
	legacyNodeCompat: boolean;
	nodejsCompat: boolean;

	workerScriptPath: string;
};
type PluginArgs = Omit<
	PagesBuildArgs,
	"buildOutputDirectory" | "bindings" | "nodeCompat"
> & {
	plugin: true;
	outdir: string;
	legacyNodeCompat: boolean;
	nodejsCompat: boolean;
};

type ValidatedArgs = WorkerBundleArgs | PluginArgs;

const validateArgs = (args: PagesBuildArgs): ValidatedArgs => {
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

	if (args.buildOutputDirectory) {
		args.buildOutputDirectory = resolvePath(args.buildOutputDirectory);
	}
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
	if (legacyNodeCompat && nodejsCompat) {
		throw new Error(
			"The `nodejs_compat` compatibility flag cannot be used in conjunction with the legacy `--node-compat` flag. If you want to use the Workers runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command."
		);
	}

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
		...argsExceptNodeCompat,
		workerScriptPath,
		nodejsCompat,
		legacyNodeCompat,
	} as ValidatedArgs;
};
