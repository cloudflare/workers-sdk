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
import { logger } from "../../logger";
import { getBasePath } from "../../paths";
import { realTmpdir } from "../utils";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { Entry } from "../../deployment-bundle/entry";
import type { CfModule } from "../../deployment-bundle/worker";
import type { Plugin } from "esbuild";

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
	legacyNodeCompat?: boolean;
	nodejsCompat?: boolean;
	functionsDirectory: string;
	local: boolean;
};

export function buildWorkerFromFunctions({
	routesModule,
	outfile = join(realTmpdir(), `./functionsWorker-${Math.random()}.js`),
	outdir,
	minify = false,
	sourcemap = false,
	fallbackService = "ASSETS",
	watch = false,
	onEnd = () => {},
	buildOutputDirectory,
	legacyNodeCompat,
	nodejsCompat,
	functionsDirectory,
	local,
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
		legacyNodeCompat,
		nodejsCompat,
		define: {
			__FALLBACK_SERVICE__: JSON.stringify(fallbackService),
		},
		doBindings: [], // Pages functions don't support internal Durable Objects
		plugins: [
			buildNotifierPlugin(onEnd),
			{
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

						const isDirectory =
							exists && (await lstat(directory)).isDirectory();

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
                    const url = new URL(request.url)
                    const relativePathname = \`/\${url.pathname.replace(functionPath, "") || ""}\`.replace(/^\\/\\//, '/');
                    url.pathname = '/cdn-cgi/pages-plugins/${identifier}' + relativePathname
                    request = new Request(url.toString(), request)
                    return env.ASSETS.fetch(request)
                  }`,
								};
							}
						}
					);
				},
			},
		],
		isOutfile: !outdir,
		serveAssetsFromWorker: false,
		checkFetch: local,
		targetConsumer: local ? "dev" : "deploy",
		forPages: true,
		local,
	});
}

export type RawOptions = {
	workerScriptPath: string;
	outfile?: string;
	outdir?: string;
	directory: string;
	bundle?: boolean;
	external?: string[];
	minify?: boolean;
	sourcemap?: boolean;
	watch?: boolean;
	plugins?: Plugin[];
	onEnd?: () => void;
	buildOutputDirectory?: string;
	legacyNodeCompat?: boolean;
	nodejsCompat?: boolean;
	local: boolean;
	additionalModules?: CfModule[];
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
	outfile = join(realTmpdir(), `./functionsWorker-${Math.random()}.js`),
	outdir,
	directory,
	bundle = true,
	external,
	minify = false,
	sourcemap = false,
	watch = false,
	plugins = [],
	onEnd = () => {},
	legacyNodeCompat,
	nodejsCompat,
	local,
	additionalModules = [],
}: RawOptions) {
	const entry: Entry = {
		file: workerScriptPath,
		directory: resolve(directory),
		format: "modules",
		moduleRoot: resolve(directory),
	};
	const moduleCollector = external
		? noopModuleCollector
		: createModuleCollector({ entry, findAdditionalModules: false });

	return bundleWorker(entry, outdir ? resolve(outdir) : resolve(outfile), {
		bundle,
		moduleCollector,
		additionalModules,
		minify,
		sourcemap,
		watch,
		legacyNodeCompat,
		nodejsCompat,
		define: {},
		doBindings: [], // Pages functions don't support internal Durable Objects
		plugins: [
			...plugins,
			buildNotifierPlugin(onEnd),
			...(external
				? [
						// In some cases, we want to enable bundling in esbuild so that we can flatten a shim around the entrypoint, but we still don't want to actually bundle in all the chunks that a Worker references.
						// This plugin allows us to mark those chunks as external so they are not inlined.
						{
							name: "external-fixer",
							setup(pluginBuild) {
								pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
									if (external.includes(resolve(args.resolveDir, args.path))) {
										return { path: args.path, external: true };
									}
								});
							},
						} as Plugin,
				  ]
				: []),
		],
		isOutfile: !outdir,
		serveAssetsFromWorker: false,
		checkFetch: local,
		targetConsumer: local ? "dev" : "deploy",
		forPages: true,
		local,
	});
}

export async function traverseAndBuildWorkerJSDirectory({
	workerJSDirectory,
	buildOutputDirectory,
	nodejsCompat,
}: {
	workerJSDirectory: string;
	buildOutputDirectory: string;
	nodejsCompat?: boolean;
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
		]
	);

	const outfile = join(realTmpdir(), `./bundledWorker-${Math.random()}.mjs`);
	const bundleResult = await buildRawWorker({
		workerScriptPath: entrypoint,
		bundle: true,
		external: additionalModules.map((m) => join(workerJSDirectory, m.name)),
		outfile,
		directory: buildOutputDirectory,
		local: false,
		sourcemap: true,
		watch: false,
		onEnd: () => {},
		nodejsCompat,
		additionalModules,
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
				if (result.errors.length > 0) {
					logger.error(
						`${result.errors.length} error(s) and ${result.warnings.length} warning(s) when compiling Worker.`
					);
				} else if (result.warnings.length > 0) {
					logger.warn(
						`${result.warnings.length} warning(s) when compiling Worker.`
					);
					onEnd();
				} else {
					logger.log("✨ Compiled Worker successfully");
					onEnd();
				}
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
export async function checkRawWorker(scriptPath: string, onEnd: () => void) {
	await esBuild({
		entryPoints: [scriptPath],
		write: false,
		// we need it to be bundled so that any imports that are used are affected by the blocker plugin
		bundle: true,
		plugins: [blockWorkerJsImports, buildNotifierPlugin(onEnd)],
	});
}

const blockWorkerJsImports: Plugin = {
	name: "block-worker-js-imports",
	setup(build) {
		build.onResolve({ filter: /.*/g }, (args) => {
			// If it's the entrypoint, let it be as is
			if (args.kind === "entry-point") {
				return {
					path: args.path,
				};
			}
			// Otherwise, block any imports that the file is requesting
			throw new FatalError(
				"_worker.js is not being bundled by Wrangler but it is importing from another file.\n" +
					"This will throw an error if deployed.\n" +
					"You should bundle the Worker in a pre-build step, remove the import if it is unused, or ask Wrangler to bundle it by setting `--bundle`.",
				1
			);
		});
	},
};
