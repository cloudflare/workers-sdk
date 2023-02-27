import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve as resolvePath } from "node:path";
import { createUploadWorkerBundleContents } from "../api/pages/create-worker-bundle-contents";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { buildFunctions } from "./buildFunctions";
import { isInPagesCI } from "./constants";
import {
	EXIT_CODE_FUNCTIONS_NO_ROUTES_ERROR,
	FunctionsNoRoutesError,
	getFunctionsNoRoutesWarning,
} from "./errors";
import { buildRawWorker } from "./functions/buildWorker";
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
				default: "_worker.js",
				description: "The location of the output Worker script",
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
			"experimental-worker-bundle": {
				type: "boolean",
				default: false,
				hidden: true,
				description:
					"Whether to process non-JS module imports or not, such as wasm/text/binary, when we run bundling on `functions` or `_worker.js`",
			},
		})
		.epilogue(pagesBetaWarning);
}

export const Handler = async ({
	directory,
	outfile,
	outputConfigPath,
	outputRoutesPath: routesOutputPath,
	minify,
	sourcemap,
	fallbackService,
	watch,
	plugin,
	buildOutputDirectory,
	nodeCompat: legacyNodeCompat,
	compatibilityFlags,
	bindings,
	experimentalWorkerBundle,
}: PagesBuildArgs) => {
	if (!isInPagesCI) {
		// Beta message for `wrangler pages <commands>` usage
		logger.log(pagesBetaWarning);
	}

	if (legacyNodeCompat) {
		console.warn(
			"Enabling Node.js compatibility mode for builtins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
		);
	}
	const nodejsCompat = compatibilityFlags?.includes("nodejs_compat");
	if (legacyNodeCompat && nodejsCompat) {
		throw new Error(
			"The `nodejs_compat` compatibility flag cannot be used in conjunction with the legacy `--node-compat` flag. If you want to use the Workers runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command."
		);
	}

	let d1Databases: string[] | undefined = undefined;
	if (bindings) {
		try {
			const decodedBindings = JSON.parse(bindings);
			d1Databases = Object.keys(decodedBindings?.d1_databases || {});
		} catch {
			throw new FatalError("Could not parse a valid set of 'bindings'.", 1);
		}
	}

	buildOutputDirectory ??= dirname(outfile);

	const workerScriptPath = resolvePath(buildOutputDirectory, "_worker.js");
	const foundWorkerScript = existsSync(workerScriptPath);
	let bundle: BundleResult | undefined = undefined;

	if (!foundWorkerScript && !existsSync(directory)) {
		throw new FatalError(`Could not find anything to build.
We first looked inside the build output directory (${basename(
			resolvePath(buildOutputDirectory)
		)}), then looked for the Functions directory (${basename(
			directory
		)}) but couldn't find anything to build.
	➤ If you are trying to build _worker.js, please make sure you provide the [--build-output-directory] containing your static files.
	➤ If you are trying to build Pages Functions, please make sure [--directory] points to the location of your Functions files.`);
	}

	/**
	 * prioritize building `_worker.js` over Pages Functions, if both exist
	 * and if we were able to resolve _worker.js
	 */
	if (experimentalWorkerBundle && foundWorkerScript) {
		/**
		 * `buildRawWorker` builds `_worker.js`, but doesn't give us the bundle
		 * we want to return, which includes the external dependencies (like wasm,
		 * binary, text). Let's output that build result to memory and only write
		 * to disk once we have the final bundle
		 */
		const workerOutfile = experimentalWorkerBundle
			? join(tmpdir(), `./bundledWorker-${Math.random()}.mjs`)
			: outfile;

		bundle = await buildRawWorker({
			workerScriptPath,
			outfile: workerOutfile,
			directory: buildOutputDirectory,
			local: false,
			sourcemap: true,
			watch: false,
			onEnd: () => {},
			betaD1Shims: d1Databases,
			experimentalWorkerBundle,
		});
	} else {
		try {
			/**
			 * `buildFunctions` builds `/functions`, but doesn't give us the bundle
			 * we want to return, which includes the external dependencies (like wasm,
			 * binary, text). Let's output that build result to memory and only write
			 * to disk once we have the final bundle
			 */
			const functionsOutfile = experimentalWorkerBundle
				? join(tmpdir(), `./functionsWorker-${Math.random()}.js`)
				: outfile;

			bundle = await buildFunctions({
				outfile: functionsOutfile,
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
				experimentalWorkerBundle,
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

	if (experimentalWorkerBundle) {
		const workerBundleContents = await createUploadWorkerBundleContents(
			bundle as BundleResult
		);

		writeFileSync(
			outfile,
			Buffer.from(await workerBundleContents.arrayBuffer())
		);
	}

	await metrics.sendMetricsEvent("build pages functions");
};
