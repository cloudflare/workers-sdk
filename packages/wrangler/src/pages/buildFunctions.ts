import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FatalError } from "../errors";
import { toUrlPath } from "../paths";
import { FunctionsNoRoutesError } from "./errors";
import { buildPluginFromFunctions } from "./functions/buildPlugin";
import { buildWorkerFromFunctions } from "./functions/buildWorker";
import { generateConfigFromFileTree } from "./functions/filepath-routing";
import { writeRoutesModule } from "./functions/routes";
import { convertRoutesToRoutesJSONSpec } from "./functions/routes-transformation";
import { getPagesTmpDir, RUNNING_BUILDERS } from "./utils";
import type { BundleResult } from "../deployment-bundle/bundle";
import type { PagesBuildArgs } from "./build";
import type { Config } from "./functions/routes";
import type { NodeJSCompatMode } from "miniflare";

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
	external,
}: Partial<
	Pick<
		PagesBuildArgs,
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
	routesOutputPath?: PagesBuildArgs["outputRoutesPath"];
	local: boolean;
	nodejsCompatMode?: NodeJSCompatMode;
	// Allow `routesModule` to be fixed, so we don't create a new file in the
	// temporary directory each time
	routesModule?: string;
	defineNavigatorUserAgent: boolean;
}) {
	RUNNING_BUILDERS.forEach(
		(runningBuilder) => runningBuilder.stop && runningBuilder.stop()
	);

	const baseURL = toUrlPath("/");

	const config: Config = await generateConfigFromFileTree({
		baseDir: functionsDirectory,
		baseURL,
	});

	if (!config.routes || config.routes.length === 0) {
		throw new FunctionsNoRoutesError(
			`Failed to find any routes while compiling Functions in: ${functionsDirectory}`
		);
	}

	if (routesOutputPath) {
		const routesJSON = convertRoutesToRoutesJSONSpec(config.routes);
		writeFileSync(routesOutputPath, JSON.stringify(routesJSON, null, 2));
	}

	if (outputConfigPath) {
		writeFileSync(
			outputConfigPath,
			JSON.stringify({ ...config, baseURL }, null, 2)
		);
	}

	await writeRoutesModule({
		config,
		srcDir: functionsDirectory,
		outfile: routesModule,
	});

	const absoluteFunctionsDirectory = resolve(functionsDirectory);
	let bundle: BundleResult;

	if (plugin) {
		if (outdir === undefined) {
			throw new FatalError(
				"Must specify an output directory when building a Plugin.",
				1
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
			external,
		});
	}

	RUNNING_BUILDERS.push(bundle);
	return bundle;
}
