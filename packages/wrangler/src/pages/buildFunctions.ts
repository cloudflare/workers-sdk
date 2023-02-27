import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { toUrlPath } from "../paths";
import { FunctionsNoRoutesError } from "./errors";
import { buildPlugin } from "./functions/buildPlugin";
import { buildWorker } from "./functions/buildWorker";
import { generateConfigFromFileTree } from "./functions/filepath-routing";
import { writeRoutesModule } from "./functions/routes";
import { convertRoutesToRoutesJSONSpec } from "./functions/routes-transformation";
import { RUNNING_BUILDERS } from "./utils";
import type { BundleResult } from "../bundle";
import type { PagesBuildArgs } from "./build";
import type { Config } from "./functions/routes";

/**
 * Builds a Functions worker based on the functions directory, with filepath and handler based routing.
 * @throws FunctionsNoRoutesError when there are no routes found in the functions directory
 */

export async function buildFunctions({
	outfile,
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
	legacyNodeCompat,
	nodejsCompat,
	local,
	d1Databases,
	experimentalWorkerBundle = false,
}: Partial<
	Pick<
		PagesBuildArgs,
		| "outputConfigPath"
		| "minify"
		| "sourcemap"
		| "fallbackService"
		| "watch"
		| "plugin"
		| "buildOutputDirectory"
	>
> & {
	functionsDirectory: string;
	onEnd?: () => void;
	outfile: Required<PagesBuildArgs>["outfile"];
	routesOutputPath?: PagesBuildArgs["outputRoutesPath"];
	local: boolean;
	d1Databases?: string[];
	experimentalWorkerBundle?: boolean;
	legacyNodeCompat?: boolean;
	nodejsCompat?: boolean;
}) {
	RUNNING_BUILDERS.forEach(
		(runningBuilder) => runningBuilder.stop && runningBuilder.stop()
	);

	const routesModule = join(tmpdir(), `./functionsRoutes-${Math.random()}.mjs`);
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
		bundle = await buildPlugin({
			routesModule,
			outfile,
			minify,
			sourcemap,
			watch,
			legacyNodeCompat,
			functionsDirectory: absoluteFunctionsDirectory,
			local,
			betaD1Shims: d1Databases,
			onEnd,
		});
	} else {
		bundle = await buildWorker({
			routesModule,
			outfile,
			minify,
			sourcemap,
			fallbackService,
			watch,
			functionsDirectory: absoluteFunctionsDirectory,
			local,
			betaD1Shims: d1Databases,
			onEnd,
			buildOutputDirectory,
			legacyNodeCompat,
			nodejsCompat,
			experimentalWorkerBundle,
		});
	}

	RUNNING_BUILDERS.push(bundle);
	return bundle;
}
