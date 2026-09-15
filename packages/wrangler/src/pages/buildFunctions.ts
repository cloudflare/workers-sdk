import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	convertRoutesToRoutesJSONSpec,
	generateConfigFromFileTree,
	PagesFunctionsError,
	PagesFunctionsErrorCode,
	writeRoutesModule,
} from "@cloudflare/pages-functions";
import { FatalError, UserError } from "@cloudflare/workers-utils";
import { toUrlPath } from "../paths";
import { ROUTES_SPEC_DESCRIPTION } from "./constants";
import { FunctionsBuildError, FunctionsNoRoutesError } from "./errors";
import { buildPluginFromFunctions } from "./functions/buildPlugin";
import { buildWorkerFromFunctions } from "./functions/buildWorker";
import { getPagesTmpDir, RUNNING_BUILDERS } from "./utils";
import type { BundleResult } from "../deployment-bundle/bundle";
import type { pagesFunctionsBuildCommand } from "./build";
import type { Config } from "@cloudflare/pages-functions";
import type { NodeJSCompatMode } from "miniflare";

/**
 * Map a {@link PagesFunctionsErrorCode} to the original Wrangler error class
 * and telemetry label that the pre-extraction code used.
 *
 * This ensures that Wrangler's top-level error handler still:
 * - classifies user-config mistakes as `UserError`/`FatalError` (not Sentry bugs)
 * - preserves the static telemetry labels for each failure mode
 */
const ERROR_CODE_TO_TELEMETRY: Record<
	PagesFunctionsErrorCode,
	{ telemetryMessage: string; ErrorClass: typeof UserError | typeof FatalError }
> = {
	[PagesFunctionsErrorCode.ROUTE_BUILD_FAILED]: {
		telemetryMessage: "pages functions route build failed",
		ErrorClass: FunctionsBuildError,
	},
	[PagesFunctionsErrorCode.INVALID_CATCHALL_ROUTE_PARAMETER]: {
		telemetryMessage: "pages functions invalid catchall route parameter",
		ErrorClass: FatalError,
	},
	[PagesFunctionsErrorCode.INVALID_ROUTE_PARAMETER]: {
		telemetryMessage: "pages functions invalid route parameter",
		ErrorClass: FatalError,
	},
	[PagesFunctionsErrorCode.INVALID_MODULE_PATH]: {
		telemetryMessage: "pages functions invalid module path",
		ErrorClass: UserError,
	},
	[PagesFunctionsErrorCode.INVALID_MODULE_IDENTIFIER]: {
		telemetryMessage: "pages functions invalid module identifier",
		ErrorClass: UserError,
	},
};

/**
 * Re-throw a {@link PagesFunctionsError} as the appropriate Wrangler error class
 * with the original telemetry label.  Non-PagesFunctionsError exceptions and
 * errors that are already UserError/FatalError are re-thrown unchanged.
 *
 * @param e - The caught exception
 */
function rethrowAsWranglerError(e: unknown): never {
	if (e instanceof FatalError || e instanceof UserError) {
		throw e;
	}
	if (!(e instanceof PagesFunctionsError)) {
		throw e;
	}

	const mapping = ERROR_CODE_TO_TELEMETRY[e.code];
	throw new mapping.ErrorClass(e.message, {
		telemetryMessage: mapping.telemetryMessage,
	});
}

/**
 * Builds a Functions worker based on the functions directory, with filepath and handler based routing.
 * @throws FunctionsNoRoutesError when there are no routes found in the functions directory
 */

export async function buildFunctions({
	outfile,
	outdir,
	outputConfigPath,
	functionsDirectory,
	minify = false,
	sourcemap = false,
	fallbackService = "ASSETS",
	watch = false,
	onEnd,
	plugin = false,
	buildOutputDirectory,
	routesOutputPath,
	nodejsCompatMode,
	local,
	routesModule = join(
		getPagesTmpDir(),
		`./functionsRoutes-${Math.random()}.mjs`
	),
	defineNavigatorUserAgent,
	checkFetch,
	external,
	metafile,
}: Partial<
	Pick<
		typeof pagesFunctionsBuildCommand.args,
		| "outfile"
		| "outdir"
		| "outputConfigPath"
		| "minify"
		| "sourcemap"
		| "fallbackService"
		| "watch"
		| "plugin"
		| "buildOutputDirectory"
		| "external"
	>
> & {
	functionsDirectory: string;
	onEnd?: () => void;
	routesOutputPath?: (typeof pagesFunctionsBuildCommand.args)["outputRoutesPath"];
	local: boolean;
	nodejsCompatMode?: NodeJSCompatMode;
	// Allow `routesModule` to be fixed, so we don't create a new file in the
	// temporary directory each time
	routesModule?: string;
	defineNavigatorUserAgent: boolean;
	checkFetch: boolean;
	metafile?: string | boolean;
}) {
	RUNNING_BUILDERS.forEach(
		(runningBuilder) => runningBuilder.stop && runningBuilder.stop()
	);

	const baseURL = toUrlPath("/");

	let config: Config;
	try {
		config = await generateConfigFromFileTree({
			baseDir: functionsDirectory,
			baseURL,
		});
	} catch (e) {
		rethrowAsWranglerError(e);
	}

	if (!config.routes || config.routes.length === 0) {
		throw new FunctionsNoRoutesError(
			`Failed to find any routes while compiling Functions in: ${functionsDirectory}`,
			{ telemetryMessage: "pages functions no routes" }
		);
	}

	if (routesOutputPath) {
		const routesJSON = convertRoutesToRoutesJSONSpec(
			config.routes,
			ROUTES_SPEC_DESCRIPTION
		);
		writeFileSync(routesOutputPath, JSON.stringify(routesJSON, null, 2));
	}

	if (outputConfigPath) {
		writeFileSync(
			outputConfigPath,
			JSON.stringify({ ...config, baseURL }, null, 2)
		);
	}

	try {
		await writeRoutesModule({
			config,
			srcDir: functionsDirectory,
			outfile: routesModule,
		});
	} catch (e) {
		rethrowAsWranglerError(e);
	}

	const absoluteFunctionsDirectory = resolve(functionsDirectory);
	let bundle: BundleResult;

	if (plugin) {
		if (outdir === undefined) {
			throw new FatalError(
				"Must specify an output directory when building a Plugin.",
				{
					code: 1,
					telemetryMessage:
						"pages functions build plugin missing output directory",
				}
			);
		}

		bundle = await buildPluginFromFunctions({
			routesModule,
			outdir,
			minify,
			sourcemap,
			watch,
			nodejsCompatMode,
			functionsDirectory: absoluteFunctionsDirectory,
			local,
			defineNavigatorUserAgent,
			checkFetch,
			external,
		});
	} else {
		bundle = await buildWorkerFromFunctions({
			routesModule,
			outfile,
			outdir,
			minify,
			sourcemap,
			fallbackService,
			watch,
			functionsDirectory: absoluteFunctionsDirectory,
			local,
			onEnd,
			buildOutputDirectory,
			nodejsCompatMode,
			defineNavigatorUserAgent,
			checkFetch,
			external,
			metafile,
		});
	}

	RUNNING_BUILDERS.push(bundle);
	return bundle;
}
