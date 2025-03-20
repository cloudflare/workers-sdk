import assert from "node:assert";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { builtinModules } from "node:module";
import * as path from "node:path";
import { createMiddleware } from "@hattip/adapter-node";
import MagicString from "magic-string";
import { Miniflare } from "miniflare";
import * as vite from "vite";
import {
	createModuleReference,
	matchAdditionalModule,
} from "./additional-modules";
import {
	createCloudflareEnvironmentOptions,
	initRunners,
} from "./cloudflare-environment";
import { DEFAULT_INSPECTOR_PORT } from "./constants";
import {
	addDebugToVitePrintUrls,
	debuggingPath,
	getDebugPathHtml,
} from "./debugging";
import { getWorkerConfigs, writeDeployConfig } from "./deploy-config";
import {
	getDevMiniflareOptions,
	getPreviewMiniflareOptions,
} from "./miniflare-options";
import {
	injectGlobalCode,
	isNodeCompat,
	nodeCompatExternals,
	resolveNodeJSImport,
} from "./node-js-compat";
import { resolvePluginConfig } from "./plugin-config";
import { additionalModuleGlobalRE } from "./shared";
import {
	cleanUrl,
	getOutputDirectory,
	getRouterWorker,
	toMiniflareRequest,
} from "./utils";
import { handleWebSocket } from "./websockets";
import { getWarningForWorkersConfigs } from "./workers-configs";
import type { PluginConfig, ResolvedPluginConfig } from "./plugin-config";
import type { Unstable_RawConfig } from "wrangler";

// this flag is used to show the workers configs warning only once
let workersConfigsWarningShown = false;

/**
 * Vite plugin that enables a full-featured integration between Vite and the Cloudflare Workers runtime.
 *
 * See the [README](https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare#readme) for more details.
 *
 * @param pluginConfig An optional {@link PluginConfig} object.
 */
export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin[] {
	let resolvedPluginConfig: ResolvedPluginConfig;
	let resolvedViteConfig: vite.ResolvedConfig;
	let miniflare: Miniflare | undefined;

	const additionalModulePaths = new Set<string>();

	// This is set when the client environment is built to determine if the entry Worker should include assets
	let hasClientBuild = false;

	return [
		{
			name: "vite-plugin-cloudflare",
			// This only applies to this plugin so is safe to use while other plugins migrate to the Environment API
			sharedDuringBuild: true,
			config(userConfig, env) {
				if (env.isPreview) {
					// Short-circuit the whole configuration if we are in preview mode
					return { appType: "custom" };
				}

				resolvedPluginConfig = resolvePluginConfig(
					pluginConfig,
					userConfig,
					env
				);

				if (!workersConfigsWarningShown) {
					workersConfigsWarningShown = true;
					const workersConfigsWarning = getWarningForWorkersConfigs(
						resolvedPluginConfig.rawConfigs
					);
					if (workersConfigsWarning) {
						console.warn(workersConfigsWarning);
					}
				}

				return {
					appType: "custom",
					environments:
						resolvedPluginConfig.type === "workers"
							? {
									...Object.fromEntries(
										Object.entries(resolvedPluginConfig.workers).map(
											([environmentName, workerConfig]) => {
												return [
													environmentName,
													createCloudflareEnvironmentOptions(
														workerConfig,
														userConfig,
														environmentName
													),
												];
											}
										)
									),
									client: {
										build: {
											outDir: getOutputDirectory(userConfig, "client"),
										},
									},
								}
							: undefined,
					builder: {
						buildApp:
							userConfig.builder?.buildApp ??
							(async (builder) => {
								const clientEnvironment = builder.environments.client;
								const defaultHtmlPath = path.resolve(
									builder.config.root,
									"index.html"
								);

								if (
									clientEnvironment &&
									(clientEnvironment.config.build.rollupOptions.input ||
										fs.existsSync(defaultHtmlPath))
								) {
									await builder.build(clientEnvironment);
								}

								if (resolvedPluginConfig.type === "workers") {
									const workerEnvironments = Object.keys(
										resolvedPluginConfig.workers
									).map((environmentName) => {
										const environment = builder.environments[environmentName];

										assert(
											environment,
											`${environmentName} environment not found`
										);

										return environment;
									});

									await Promise.all(
										workerEnvironments.map((environment) =>
											builder.build(environment)
										)
									);
								}
							}),
					},
				};
			},
			buildStart() {
				// This resets the value when the dev server restarts
				workersConfigsWarningShown = false;
			},
			configResolved(config) {
				resolvedViteConfig = config;
			},
			generateBundle(_, bundle) {
				let config: Unstable_RawConfig | undefined;

				if (resolvedPluginConfig.type === "workers") {
					const workerConfig =
						resolvedPluginConfig.workers[this.environment.name];

					const entryChunk = Object.entries(bundle).find(
						([_, chunk]) => chunk.type === "chunk" && chunk.isEntry
					);

					if (!workerConfig || !entryChunk) {
						return;
					}

					workerConfig.main = entryChunk[0];
					workerConfig.no_bundle = true;
					workerConfig.rules = [
						{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] },
					];

					const isEntryWorker =
						this.environment.name ===
						resolvedPluginConfig.entryWorkerEnvironmentName;

					if (isEntryWorker && hasClientBuild) {
						const workerOutputDirectory = this.environment.config.build.outDir;
						const clientOutputDirectory =
							resolvedViteConfig.environments.client?.build.outDir;

						assert(
							clientOutputDirectory,
							"Unexpected error: client output directory is undefined"
						);

						workerConfig.assets = {
							...workerConfig.assets,
							directory: path.relative(
								path.resolve(resolvedViteConfig.root, workerOutputDirectory),
								path.resolve(resolvedViteConfig.root, clientOutputDirectory)
							),
						};
					} else {
						workerConfig.assets = undefined;
					}

					config = workerConfig;

					if (workerConfig.configPath) {
						const dotDevDotVarsContent = getDotDevDotVarsContent(
							workerConfig.configPath,
							resolvedPluginConfig.cloudflareEnv
						);
						// Save a .dev.vars file to the worker's build output directory
						// when it exists so that it will be then detected by `vite preview`
						if (dotDevDotVarsContent) {
							this.emitFile({
								type: "asset",
								fileName: ".dev.vars",
								source: dotDevDotVarsContent,
							});
						}
					}
				} else if (this.environment.name === "client") {
					const assetsOnlyConfig = resolvedPluginConfig.config;

					assetsOnlyConfig.assets = {
						...assetsOnlyConfig.assets,
						directory: ".",
					};

					const filesToAssetsIgnore = ["wrangler.json", ".dev.vars"];

					this.emitFile({
						type: "asset",
						fileName: ".assetsignore",
						source: `${filesToAssetsIgnore.join("\n")}\n`,
					});

					config = assetsOnlyConfig;
				}

				if (!config) {
					return;
				}

				// Set to `undefined` if it's an empty object so that the user doesn't see a warning about using `unsafe` fields when deploying their Worker.
				if (config.unsafe && Object.keys(config.unsafe).length === 0) {
					config.unsafe = undefined;
				}

				this.emitFile({
					type: "asset",
					fileName: "wrangler.json",
					source: JSON.stringify(config),
				});
			},
			writeBundle() {
				// This relies on the assumption that the client environment is built first
				// Composable `buildApp` hooks could provide a more robust alternative in future
				if (this.environment.name === "client") {
					hasClientBuild = true;
				}
				// These conditions ensure the deploy config is emitted once per application build as `writeBundle` is called for each environment.
				// If Vite introduces an additional hook that runs after the application has built then we could use that instead.
				if (
					this.environment.name ===
					(resolvedPluginConfig.type === "assets-only"
						? "client"
						: resolvedPluginConfig.entryWorkerEnvironmentName)
				) {
					writeDeployConfig(resolvedPluginConfig, resolvedViteConfig);
				}
			},
			handleHotUpdate(options) {
				if (resolvedPluginConfig.configPaths.has(options.file)) {
					options.server.restart();
				}
			},
			async buildEnd() {
				if (miniflare) {
					await miniflare.dispose();
					miniflare = undefined;
				}
			},
			async configureServer(viteDevServer) {
				assert(
					viteDevServer.httpServer,
					"Unexpected error: No Vite HTTP server"
				);

				miniflare = new Miniflare(
					getDevMiniflareOptions(resolvedPluginConfig, viteDevServer)
				);

				await initRunners(resolvedPluginConfig, viteDevServer, miniflare);
				const routerWorker = await getRouterWorker(miniflare);

				const middleware = createMiddleware(
					({ request }) => {
						return routerWorker.fetch(toMiniflareRequest(request), {
							redirect: "manual",
						}) as any;
					},
					{ alwaysCallNext: false }
				);

				handleWebSocket(viteDevServer.httpServer, routerWorker.fetch);

				return () => {
					viteDevServer.middlewares.use((req, res, next) => {
						middleware(req, res, next);
					});
				};
			},
			configurePreviewServer(vitePreviewServer) {
				const workerConfigs = getWorkerConfigs(vitePreviewServer.config.root);

				const miniflare = new Miniflare(
					getPreviewMiniflareOptions(
						vitePreviewServer,
						workerConfigs,
						pluginConfig.persistState ?? true,
						pluginConfig.inspectorPort
					)
				);

				const middleware = createMiddleware(
					({ request }) => {
						return miniflare.dispatchFetch(toMiniflareRequest(request), {
							redirect: "manual",
						}) as any;
					},
					{ alwaysCallNext: false }
				);

				handleWebSocket(vitePreviewServer.httpServer, miniflare.dispatchFetch);

				// In preview mode we put our middleware at the front of the chain so that all assets are handled in Miniflare
				vitePreviewServer.middlewares.use((req, res, next) => {
					middleware(req, res, next);
				});
			},
		},
		// Plugin to support `.wasm?init` extension
		{
			name: "vite-plugin-cloudflare:wasm-helper",
			enforce: "pre",
			applyToEnvironment(environment) {
				return getWorkerConfig(environment.name) !== undefined;
			},
			load(id) {
				if (!id.endsWith(".wasm?init")) {
					return;
				}

				return `
					import wasm from "${cleanUrl(id)}";
					export default function(opts = {}) {
						return WebAssembly.instantiate(wasm, opts);
					}
				`;
			},
		},
		// Plugin to support additional modules
		{
			name: "vite-plugin-cloudflare:additional-modules",
			// We set `enforce: "pre"` so that this plugin runs before the Vite core plugins.
			// Otherwise the `vite:wasm-fallback` plugin prevents the `.wasm` extension being used for module imports.
			enforce: "pre",
			applyToEnvironment(environment) {
				// Note that this hook does not get called in preview mode.
				return getWorkerConfig(environment.name) !== undefined;
			},
			async resolveId(source, importer, options) {
				const additionalModuleType = matchAdditionalModule(source);

				if (!additionalModuleType) {
					return;
				}

				// We clean the module URL here as the default rules include `.wasm?module`.
				// We therefore need the match to include the query param but remove it before resolving the ID.
				const resolved = await this.resolve(
					cleanUrl(source),
					importer,
					options
				);

				if (!resolved) {
					throw new Error(`Import "${source}" not found. Does the file exist?`);
				}

				// Add the path to the additional module so that we can identify the module in the `hotUpdate` hook
				additionalModulePaths.add(resolved.id);

				return {
					external: true,
					id: createModuleReference(additionalModuleType, resolved.id),
				};
			},
			hotUpdate(options) {
				if (additionalModulePaths.has(options.file)) {
					options.server.restart();
				}
			},
			async renderChunk(code, chunk) {
				const matches = code.matchAll(additionalModuleGlobalRE);
				let magicString: MagicString | undefined;

				for (const match of matches) {
					magicString ??= new MagicString(code);
					const [full, _, modulePath] = match;

					assert(
						modulePath,
						`Unexpected error: module path not found in reference ${full}.`
					);

					let source: Buffer;

					try {
						source = await fsp.readFile(modulePath);
					} catch (error) {
						throw new Error(
							`Import "${modulePath}" not found. Does the file exist?`
						);
					}

					const referenceId = this.emitFile({
						type: "asset",
						name: path.basename(modulePath),
						originalFileName: modulePath,
						source,
					});

					const emittedFileName = this.getFileName(referenceId);
					const relativePath = vite.normalizePath(
						path.relative(path.dirname(chunk.fileName), emittedFileName)
					);
					const importPath = relativePath.startsWith(".")
						? relativePath
						: `./${relativePath}`;

					magicString.update(
						match.index,
						match.index + full.length,
						importPath
					);
				}

				if (magicString) {
					return {
						code: magicString.toString(),
						map: this.environment.config.build.sourcemap
							? magicString.generateMap({ hires: "boundary" })
							: null,
					};
				}
			},
		},
		// Plugin that can provide Node.js compatibility support for Vite Environments that are hosted in Cloudflare Workers.
		{
			name: "vite-plugin-cloudflare:nodejs-compat",
			apply(_config, env) {
				// Skip this whole plugin if we are in preview mode
				return !env.isPreview;
			},
			configEnvironment(name) {
				// Only configure this environment if it is a Worker using Node.js compatibility.
				if (isNodeCompat(getWorkerConfig(name))) {
					return {
						resolve: {
							builtins: [...nodeCompatExternals],
						},
						optimizeDeps: {
							// This is a list of dependency entry-points that should be pre-bundled.
							// In this case we provide a list of all the possible polyfills so that they are pre-bundled,
							// ready ahead the first request to the dev server.
							// Without this the dependency optimizer will try to bundle them on-the-fly in the middle of the first request,
							// which can potentially cause problems if it leads to previous pre-bundling to become stale and needing to be reloaded.

							// TODO: work out how to re-enable pre-bundling of these
							// include: [...getNodeCompatEntries()],

							// This is a list of module specifiers that the dependency optimizer should not follow when doing import analysis.
							// In this case we provide a list of all the Node.js modules, both those built-in to workerd and those that will be polyfilled.
							// Obviously we don't want/need the optimizer to try to process modules that are built-in;
							// But also we want to avoid following the ones that are polyfilled since the dependency-optimizer import analyzer does not
							// resolve these imports using our `resolveId()` hook causing the optimization step to fail.
							exclude: [
								...builtinModules,
								...builtinModules.map((m) => `node:${m}`),
							],
						},
					};
				}
			},
			applyToEnvironment(environment) {
				// Only run this plugin's runtime hooks if it is a Worker using Node.js compatibility.
				return isNodeCompat(getWorkerConfig(environment.name));
			},
			// We need the resolver from this plugin to run before built-in ones, otherwise Vite's built-in
			// resolver will try to externalize the Node.js module imports (e.g. `perf_hooks` and `node:tty`)
			// rather than allowing the resolve hook here to alias then to polyfills.
			enforce: "pre",
			async resolveId(source, importer, options) {
				// See if we can map the `source` to a Node.js compat alias.
				const result = resolveNodeJSImport(source);
				if (!result) {
					// The source is not a Node.js compat alias so just pass it through
					return this.resolve(source, importer, options);
				}

				if (this.environment.mode === "dev") {
					assert(
						this.environment.depsOptimizer,
						"depsOptimizer is required in dev mode"
					);
					// We are in dev mode (rather than build).
					// So let's pre-bundle this polyfill entry-point using the dependency optimizer.
					const { id } = this.environment.depsOptimizer.registerMissingImport(
						result.unresolved,
						result.resolved
					);
					// We use the unresolved path to the polyfill and let the dependency optimizer's
					// resolver find the resolved path to the bundled version.
					return this.resolve(id, importer, options);
				}

				// We are in build mode so return the absolute path to the polyfill.
				return this.resolve(result.resolved, importer, options);
			},
			async transform(code, id) {
				// Inject the Node.js compat globals into the entry module for Node.js compat environments.
				const workerConfig = getWorkerConfig(this.environment.name);
				assert(workerConfig, "Expected a worker config");
				const resolvedId = await this.resolve(workerConfig.main);
				if (id === resolvedId?.id) {
					return injectGlobalCode(id, code);
				}
			},
		},
		// Plugin that provides an __debug path for debugging the Cloudflare Workers.
		{
			name: "vite-plugin-cloudflare:debug",
			// Note: this plugin needs to run before the main vite-plugin-cloudflare so that
			//       the preview middleware here can take precedence
			enforce: "pre",
			configureServer(viteDevServer) {
				if (
					resolvedPluginConfig.type === "workers" &&
					resolvedPluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(viteDevServer);
				}

				const workerNames =
					resolvedPluginConfig.type === "assets-only"
						? []
						: Object.values(resolvedPluginConfig.workers).map(
								(worker) => worker.name
							);

				viteDevServer.middlewares.use((req, res, next) => {
					if (
						req.url === debuggingPath &&
						resolvedPluginConfig.inspectorPort !== false
					) {
						const html = getDebugPathHtml(
							workerNames,
							resolvedPluginConfig.inspectorPort
						);
						res.setHeader("Content-Type", "text/html");
						return res.end(html);
					}
					next();
				});
			},
			configurePreviewServer(vitePreviewServer) {
				const workerConfigs = getWorkerConfigs(vitePreviewServer.config.root);

				if (workerConfigs.length >= 1 && pluginConfig.inspectorPort !== false) {
					addDebugToVitePrintUrls(vitePreviewServer);
				}

				const workerNames = workerConfigs.map((worker) => {
					assert(worker.name);
					return worker.name;
				});

				vitePreviewServer.middlewares.use((req, res, next) => {
					if (
						req.url === debuggingPath &&
						pluginConfig.inspectorPort !== false
					) {
						const html = getDebugPathHtml(
							workerNames,
							pluginConfig.inspectorPort ?? DEFAULT_INSPECTOR_PORT
						);
						res.setHeader("Content-Type", "text/html");
						return res.end(html);
					}
					next();
				});
			},
		},
	];

	function getWorkerConfig(environmentName: string) {
		assert(resolvedPluginConfig, "Expected resolvedPluginConfig to be defined");
		return resolvedPluginConfig.type !== "assets-only"
			? resolvedPluginConfig.workers[environmentName]
			: undefined;
	}
}

/**
 * Gets the content of a the potential `.dev.vars` target file
 *
 * Note: This resolves the .dev.vars file path following the same logic
 *       as `loadDotEnv` in `/packages/wrangler/src/config/index.ts`
 *       the two need to be kept in sync
 *
 * @param configPath the path to the worker's wrangler config file
 * @param cloudflareEnv the target cloudflare environment
 */
function getDotDevDotVarsContent(
	configPath: string,
	cloudflareEnv: string | undefined
) {
	const configDir = path.dirname(configPath);

	const defaultDotDevDotVarsPath = `${configDir}/.dev.vars`;
	const inputDotDevDotVarsPath = `${defaultDotDevDotVarsPath}${cloudflareEnv ? `.${cloudflareEnv}` : ""}`;

	const targetPath = fs.existsSync(inputDotDevDotVarsPath)
		? inputDotDevDotVarsPath
		: fs.existsSync(defaultDotDevDotVarsPath)
			? defaultDotDevDotVarsPath
			: null;

	if (targetPath) {
		const dotDevDotVarsContent = fs.readFileSync(targetPath);
		return dotDevDotVarsContent;
	}

	return null;
}
