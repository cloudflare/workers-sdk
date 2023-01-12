import { access, cp, lstat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build as esBuild } from "esbuild";
import { nanoid } from "nanoid";
import { bundleWorker } from "../../bundle";
import { logger } from "../../logger";
import { getBasePath } from "../../paths";
import { D1_BETA_PREFIX } from "../../worker";
import type { Plugin } from "esbuild";

export type Options = {
	routesModule: string;
	outfile: string;
	minify?: boolean;
	sourcemap?: boolean;
	fallbackService?: string;
	watch?: boolean;
	onEnd?: () => void;
	buildOutputDirectory?: string;
	nodeCompat?: boolean;
	functionsDirectory: string;
	local: boolean;
	betaD1Shims?: string[];
};

export function buildWorker({
	routesModule,
	outfile = "bundle.js",
	minify = false,
	sourcemap = false,
	fallbackService = "ASSETS",
	watch = false,
	onEnd = () => {},
	buildOutputDirectory,
	nodeCompat,
	functionsDirectory,
	local,
	betaD1Shims,
}: Options) {
	return bundleWorker(
		{
			file: resolve(getBasePath(), "templates/pages-template-worker.ts"),
			directory: functionsDirectory,
			format: "modules",
		},
		resolve(outfile),
		{
			inject: [routesModule],
			minify,
			sourcemap,
			watch,
			nodeCompat,
			loader: {
				".txt": "text",
				".html": "text",
			},
			define: {
				__FALLBACK_SERVICE__: JSON.stringify(fallbackService),
			},
			betaD1Shims: (betaD1Shims || []).map(
				(binding) => `${D1_BETA_PREFIX}${binding}`
			),
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
			isOutfile: true,
			serveAssetsFromWorker: false,
			disableModuleCollection: true,
			rules: [],
			checkFetch: local,
			targetConsumer: local ? "dev" : "publish",
			local,
			experimentalLocal: false,
		}
	);
}

export type RawOptions = {
	workerScriptPath: string;
	outfile: string;
	directory: string;
	minify?: boolean;
	sourcemap?: boolean;
	watch?: boolean;
	plugins?: Plugin[];
	onEnd?: () => void;
	buildOutputDirectory?: string;
	nodeCompat?: boolean;
	local: boolean;
	betaD1Shims?: string[];
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
	outfile,
	directory,
	minify = false,
	sourcemap = false,
	watch = false,
	plugins = [],
	onEnd = () => {},
	nodeCompat,
	local,
	betaD1Shims,
}: RawOptions) {
	return bundleWorker(
		{
			file: workerScriptPath,
			directory: resolve(directory),
			format: "modules",
		},
		resolve(outfile),
		{
			minify,
			sourcemap,
			watch,
			nodeCompat,
			loader: {
				".txt": "text",
				".html": "text",
			},
			define: {},
			betaD1Shims: (betaD1Shims || []).map(
				(binding) => `${D1_BETA_PREFIX}${binding}`
			),
			plugins: [...plugins, buildNotifierPlugin(onEnd)],
			isOutfile: true,
			serveAssetsFromWorker: false,
			disableModuleCollection: true,
			rules: [],
			checkFetch: local,
			targetConsumer: local ? "dev" : "publish",
			local,
			experimentalLocal: false,
		}
	);
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
			logger.error(
				"_worker.js is not being bundled by Wrangler but it is importing from another file.\n" +
					"This will throw an error if deployed.\n" +
					"You should bundle the Worker in a pre-build step, remove the import if it is unused, or ask Wrangler to bundle it by setting `--bundle`."
			);
			process.exit(1);
		});
	},
};
