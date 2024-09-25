import { access, cp, lstat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build as esBuild } from "esbuild";
import { nanoid } from "nanoid";
import { bundleWorker } from "../../deployment-bundle/bundle";
import { findAdditionalModules } from "../../deployment-bundle/find-additional-modules";
import {
	createModuleCollector,
	noopModuleCollector,
} from "../../deployment-bundle/module-collection";
import { FatalError } from "../../errors";
import { logBuildFailure, logger } from "../../logger";
import { getBasePath } from "../../paths";
import { getPagesProjectRoot, getPagesTmpDir } from "../utils";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { Entry } from "../../deployment-bundle/entry";
import type { CfModule } from "../../deployment-bundle/worker";
import type { Plugin } from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

export type Options = {
	routesModule: string;
	outfile?: string;
	outdir?: string;
	minify?: boolean;
	sourcemap?: boolean;
	fallbackService?: string;
	watch?: boolean;
	onEnd?: () => void;
	buildOutputDirectory?: string;
	nodejsCompatMode?: NodeJSCompatMode;
	functionsDirectory: string;
	local: boolean;
	defineNavigatorUserAgent: boolean;
	external?: string[];
};

export function buildWorkerFromFunctions({
	routesModule,
	outfile = join(getPagesTmpDir(), `./functionsWorker-${Math.random()}.js`),
	outdir,
	minify = false,
	sourcemap = false,
	fallbackService = "ASSETS",
	watch = false,
	onEnd = () => {},
	buildOutputDirectory,
	nodejsCompatMode,
	functionsDirectory,
	local,
	defineNavigatorUserAgent,
	external,
}: Options) {
	const entry: Entry = {
		file: resolve(getBasePath(), "templates/pages-template-worker.ts"),
		directory: functionsDirectory,
		format: "modules",
		moduleRoot: functionsDirectory,
	};
	const moduleCollector = createModuleCollector({
		entry,
		findAdditionalModules: false,
	});

	return bundleWorker(entry, outdir ? resolve(outdir) : resolve(outfile), {
		bundle: true,
		additionalModules: [],
		moduleCollector,
		inject: [routesModule],
		...(outdir ? { entryName: "index" } : {}),
		minify,
		sourcemap,
		watch,
		nodejsCompatMode,
		// TODO: mock AE datasets in Pages functions for dev
		mockAnalyticsEngineDatasets: [],
		define: {
			__FALLBACK_SERVICE__: JSON.stringify(fallbackService),
		},
		alias: {},
		doBindings: [], // Pages functions don't support internal Durable Objects
		external,
		plugins: [buildNotifierPlugin(onEnd), assetsPlugin(buildOutputDirectory)],
		isOutfile: !outdir,
		serveLegacyAssetsFromWorker: false,
		checkFetch: local,
		targetConsumer: local ? "dev" : "deploy",
		local,
		projectRoot: getPagesProjectRoot(),
		defineNavigatorUserAgent,
	});
}

export type RawOptions = {
	workerScriptPath: string;
	outfile?: string;
	outdir?: string;
	directory: string;
	bundle?: boolean;
	externalModules?: string[];
	minify?: boolean;
	sourcemap?: boolean;
	watch?: boolean;
	plugins?: Plugin[];
	onEnd?: () => void;
	buildOutputDirectory?: string;
	nodejsCompatMode: NodeJSCompatMode;
	local: boolean;
	additionalModules?: CfModule[];
	defineNavigatorUserAgent: boolean;
	external?: string[];
};

/**
 * This function bundles a raw `_worker.js` Pages file
 * before it gets deployed.
 *
 * This allows Wrangler to add shims and other wrappers
 * around the handlers, which is useful to support beta features.
 */
export function buildRawWorker({
	workerScriptPath,
	outfile = join(getPagesTmpDir(), `./functionsWorker-${Math.random()}.js`),
	outdir,
	directory,
	bundle = true,
	externalModules,
	minify = false,
	sourcemap = false,
	watch = false,
	plugins = [],
	onEnd = () => {},
	nodejsCompatMode,
	local,
	additionalModules = [],
	defineNavigatorUserAgent,
	external,
}: RawOptions) {
	const entry: Entry = {
		file: workerScriptPath,
		directory: resolve(directory),
		format: "modules",
		moduleRoot: resolve(directory),
	};
	const moduleCollector = externalModules
		? noopModuleCollector
		: createModuleCollector({ entry, findAdditionalModules: false });

	return bundleWorker(entry, outdir ? resolve(outdir) : resolve(outfile), {
		bundle,
		moduleCollector,
		additionalModules,
		minify,
		sourcemap,
		watch,
		nodejsCompatMode,
		// TODO: mock AE datasets in Pages functions for dev
		mockAnalyticsEngineDatasets: [],
		define: {},
		alias: {},
		doBindings: [], // Pages functions don't support internal Durable Objects
		external,
		plugins: [
			...plugins,
			buildNotifierPlugin(onEnd),
			...(externalModules
				? [
						// In some cases, we want to enable bundling in esbuild so that we can flatten a shim around the entrypoint, but we still don't want to actually bundle in all the chunks that a Worker references.
						// This plugin allows us to mark those chunks as external so they are not inlined.
						{
							name: "external-fixer",
							setup(pluginBuild) {
								pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
									if (
										externalModules.includes(
											resolve(args.resolveDir, args.path)
										)
									) {
										return { path: args.path, external: true };
									}
								});
							},
						} as Plugin,
					]
				: []),
		],
		isOutfile: !outdir,
		serveLegacyAssetsFromWorker: false,
		checkFetch: local,
		targetConsumer: local ? "dev" : "deploy",
		local,
		projectRoot: getPagesProjectRoot(),
		defineNavigatorUserAgent,
	});
}

export async function produceWorkerBundleForWorkerJSDirectory({
	workerJSDirectory,
	bundle,
	buildOutputDirectory,
	nodejsCompatMode,
	defineNavigatorUserAgent,
	sourceMaps,
}: {
	workerJSDirectory: string;
	bundle: boolean;
	buildOutputDirectory: string;
	nodejsCompatMode: NodeJSCompatMode;
	defineNavigatorUserAgent: boolean;
	sourceMaps: boolean;
}): Promise<BundleResult> {
	const entrypoint = resolve(join(workerJSDirectory, "index.js"));

	const additionalModules = await findAdditionalModules(
		{
			file: entrypoint,
			directory: resolve(workerJSDirectory),
			format: "modules",
			moduleRoot: resolve(workerJSDirectory),
		},
		[
			{
				type: "ESModule",
				globs: ["**/*.js", "**/*.mjs"],
			},
		],
		sourceMaps
	);

	if (!bundle) {
		return {
			modules: additionalModules,
			dependencies: {},
			resolvedEntryPointPath: entrypoint,
			bundleType: "esm",
			stop: async () => {},
			sourceMapPath: undefined,
		};
	}

	const outfile = join(
		getPagesTmpDir(),
		`./bundledWorker-${Math.random()}.mjs`
	);
	const bundleResult = await buildRawWorker({
		workerScriptPath: entrypoint,
		bundle: true,
		externalModules: additionalModules.map((m) =>
			join(workerJSDirectory, m.name)
		),
		outfile,
		directory: buildOutputDirectory,
		local: false,
		sourcemap: true,
		watch: false,
		onEnd: () => {},
		nodejsCompatMode,
		additionalModules,
		defineNavigatorUserAgent,
	});
	return {
		modules: bundleResult.modules,
		dependencies: bundleResult.dependencies,
		resolvedEntryPointPath: bundleResult.resolvedEntryPointPath,
		bundleType: bundleResult.bundleType,
		stop: bundleResult.stop,
		sourceMapPath: bundleResult.sourceMapPath,
	};
}

/**
 * Creates an esbuild plugin that can notify Wrangler (via the `onEnd()`)
 * when the build completes.
 */
export function buildNotifierPlugin(onEnd: () => void): Plugin {
	return {
		name: "wrangler notifier and monitor",
		setup(pluginBuild) {
			pluginBuild.onEnd((result) => {
				if (result.errors.length > 0 || result.warnings.length > 0) {
					logBuildFailure(result.errors, result.warnings);
				} else {
					logger.log("✨ Compiled Worker successfully");
				}

				onEnd();
			});
		},
	};
}

/**
 * Runs the script through a simple esbuild bundle step to check for unwanted imports.
 *
 * This is useful when the user chooses not to bundle the `_worker.js` file by setting
 * `--no-bundle` at the command line.
 */
export async function checkRawWorker(
	scriptPath: string,
	nodejsCompatMode: NodeJSCompatMode,
	onEnd: () => void
) {
	await esBuild({
		entryPoints: [scriptPath],
		write: false,
		// we need it to be bundled so that any imports that are used are affected by the blocker plugin
		bundle: true,
		plugins: [
			blockWorkerJsImports(nodejsCompatMode),
			buildNotifierPlugin(onEnd),
		],
		logLevel: "silent",
	});
}

function blockWorkerJsImports(nodejsCompatMode: NodeJSCompatMode): Plugin {
	return {
		name: "block-worker-js-imports",
		setup(build) {
			build.onResolve({ filter: /.*/g }, (args) => {
				// If it's the entrypoint, let it be as is
				if (args.kind === "entry-point") {
					return {
						path: args.path,
					};
				}
				// If it's a node or cf built-in, mark it as external
				if (
					((nodejsCompatMode === "v1" || nodejsCompatMode === "v2") &&
						args.path.startsWith("node:")) ||
					args.path.startsWith("cloudflare:")
				) {
					return {
						path: args.path,
						external: true,
					};
				}
				// Otherwise, block any other imports that the file is requesting
				throw new FatalError(
					"_worker.js is not being bundled by Wrangler but it is importing from another file.\n" +
						"This will throw an error if deployed.\n" +
						"You should bundle the Worker in a pre-build step, remove the import if it is unused, or ask Wrangler to bundle it by setting `--bundle`.",
					1
				);
			});
		},
	};
}

function assetsPlugin(buildOutputDirectory: string | undefined): Plugin {
	return {
		name: "Assets",
		setup(pluginBuild) {
			const identifiers = new Map<string, string>();

			pluginBuild.onResolve({ filter: /^assets:/ }, async (args) => {
				const directory = resolve(
					args.resolveDir,
					args.path.slice("assets:".length)
				);

				const exists = await access(directory)
					.then(() => true)
					.catch(() => false);

				const isDirectory = exists && (await lstat(directory)).isDirectory();

				if (!isDirectory) {
					return {
						errors: [
							{
								text: `'${directory}' does not exist or is not a directory.`,
							},
						],
					};
				}

				// TODO: Consider hashing the contents rather than using a unique identifier every time?
				identifiers.set(directory, nanoid());
				if (!buildOutputDirectory) {
					console.warn(
						"You're attempting to import static assets as part of your Pages Functions, but have not specified a directory in which to put them. You must use 'wrangler pages dev <directory>' rather than 'wrangler pages dev -- <command>' to import static assets in Functions."
					);
				}
				return { path: directory, namespace: "assets" };
			});

			pluginBuild.onLoad(
				{ filter: /.*/, namespace: "assets" },
				async (args) => {
					const identifier = identifiers.get(args.path);

					if (buildOutputDirectory) {
						const staticAssetsOutputDirectory = join(
							buildOutputDirectory,
							"cdn-cgi",
							"pages-plugins",
							identifier as string
						);
						await rm(staticAssetsOutputDirectory, {
							force: true,
							recursive: true,
						});
						await cp(args.path, staticAssetsOutputDirectory, {
							force: true,
							recursive: true,
						});

						return {
							// TODO: Watch args.path for changes and re-copy when updated
							contents: `export const onRequest = ({ request, env, functionPath }) => {
								const url = new URL(request.url);
								const relativePathname = \`/\${url.pathname.replace(functionPath, "") || ""}\`.replace(/^\\/\\//, '/');
								url.pathname = '/cdn-cgi/pages-plugins/${identifier}' + relativePathname;
								request = new Request(url.toString(), request);
								return env.ASSETS.fetch(request);
							}`,
						};
					}
				}
			);
		},
	};
}
