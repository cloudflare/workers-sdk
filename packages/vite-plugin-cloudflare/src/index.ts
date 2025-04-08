import assert from "node:assert";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { createMiddleware } from "@hattip/adapter-node";
import replace from "@rollup/plugin-replace";
import MagicString from "magic-string";
import { Miniflare } from "miniflare";
import colors from "picocolors";
import * as vite from "vite";
import {
	createModuleReference,
	matchAdditionalModule,
} from "./additional-modules";
import { hasAssetsConfigChanged } from "./asset-config";
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
	nodeCompatEntries,
	nodeCompatExternals,
	NODEJS_MODULES_RE,
	nodejsBuiltins,
	NodeJsCompatWarnings,
	resolveNodeJSImport,
} from "./node-js-compat";
import { resolvePluginConfig } from "./plugin-config";
import { additionalModuleGlobalRE } from "./shared";
import {
	cleanUrl,
	getFirstAvailablePort,
	getOutputDirectory,
	getRouterWorker,
	toMiniflareRequest,
} from "./utils";
import { handleWebSocket } from "./websockets";
import { validateWorkerEnvironmentsResolvedConfigs } from "./worker-environments-validation";
import { getWarningForWorkersConfigs } from "./workers-configs";
import type {
	PluginConfig,
	ResolvedPluginConfig,
	WorkerConfig,
} from "./plugin-config";
import type { Unstable_RawConfig } from "wrangler";

export type { PluginConfig } from "./plugin-config";

// this flag is used to show the workers configs warning only once
let workersConfigsWarningShown = false;

let miniflare: Miniflare | undefined;

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

	const additionalModulePaths = new Set<string>();

	const nodeJsCompatWarningsMap = new Map<WorkerConfig, NodeJsCompatWarnings>();

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

				// TODO: the `resolvedPluginConfig` type is incorrect, it is `ResolvedPluginConfig`
				//       but it should be `ResolvedPluginConfig | undefined` (since we don't actually
				//       set this value for `vite preview`), we should fix this type
				if (resolvedPluginConfig?.type === "workers") {
					validateWorkerEnvironmentsResolvedConfigs(
						resolvedPluginConfig,
						resolvedViteConfig
					);
				}
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
			hotUpdate(options) {
				if (
					// Vite normalizes `options.file` so we use `path.resolve` for Windows compatibility
					resolvedPluginConfig.configPaths.has(path.resolve(options.file)) ||
					hasAssetsConfigChanged(
						resolvedPluginConfig,
						resolvedViteConfig,
						options.file
					)
				) {
					// It's OK for this to be called multiple times as Vite prevents concurrent execution
					options.server.restart();
					return [];
				}
			},
			async configureServer(viteDevServer) {
				assert(
					viteDevServer.httpServer,
					"Unexpected error: No Vite HTTP server"
				);

				if (!miniflare) {
					const inputInspectorPort = await getInputInspectorPortOption(
						pluginConfig,
						viteDevServer
					);

					miniflare = new Miniflare(
						getDevMiniflareOptions(
							resolvedPluginConfig,
							viteDevServer,
							inputInspectorPort
						)
					);
				} else {
					const resolvedInspectorPort =
						await getResolvedInspectorPort(pluginConfig);

					await miniflare.setOptions(
						getDevMiniflareOptions(
							resolvedPluginConfig,
							viteDevServer,
							resolvedInspectorPort ?? false
						)
					);
				}

				await initRunners(resolvedPluginConfig, viteDevServer, miniflare);

				const middleware = createMiddleware(
					async ({ request }) => {
						assert(miniflare, `Miniflare not defined`);
						const routerWorker = await getRouterWorker(miniflare);

						return routerWorker.fetch(toMiniflareRequest(request), {
							redirect: "manual",
						}) as any;
					},
					{ alwaysCallNext: false }
				);

				handleWebSocket(viteDevServer.httpServer, async () => {
					assert(miniflare, `Miniflare not defined`);
					const routerWorker = await getRouterWorker(miniflare);

					return routerWorker.fetch;
				});

				return () => {
					viteDevServer.middlewares.use((req, res, next) => {
						middleware(req, res, next);
					});
				};
			},
			async configurePreviewServer(vitePreviewServer) {
				const workerConfigs = getWorkerConfigs(vitePreviewServer.config.root);

				const inputInspectorPort = await getInputInspectorPortOption(
					pluginConfig,
					vitePreviewServer
				);

				const miniflare = new Miniflare(
					getPreviewMiniflareOptions(
						vitePreviewServer,
						workerConfigs,
						pluginConfig.persistState ?? true,
						inputInspectorPort
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

				handleWebSocket(
					vitePreviewServer.httpServer,
					() => miniflare.dispatchFetch
				);

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
					return [];
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
						build: {
							rollupOptions: {
								plugins: [
									replace({
										"process.env.NODE_ENV": JSON.stringify(
											process.env.NODE_ENV ?? "production"
										),
										preventAssignment: true,
									}),
								],
							},
						},
						resolve: {
							builtins: [...nodeCompatExternals],
						},
						optimizeDeps: {
							// This is a list of module specifiers that the dependency optimizer should not follow when doing import analysis.
							// In this case we provide a list of all the Node.js modules, both those built-in to workerd and those that will be polyfilled.
							// Obviously we don't want/need the optimizer to try to process modules that are built-in;
							// But also we want to avoid following the ones that are polyfilled since the dependency-optimizer import analyzer does not
							// resolve these imports using our `resolveId()` hook causing the optimization step to fail.
							exclude: [...nodejsBuiltins],
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
				if (!workerConfig) {
					return;
				}
				const resolvedId = await this.resolve(workerConfig.main);
				if (id === resolvedId?.id) {
					return injectGlobalCode(id, code);
				}
			},
			async configureServer(viteDevServer) {
				// Pre-optimize Node.js compat library entry-points for those environments that need it.
				await Promise.all(
					Object.values(viteDevServer.environments).flatMap(
						async (environment) => {
							const workerConfig = getWorkerConfig(environment.name);
							if (isNodeCompat(workerConfig)) {
								// Make sure that the dependency optimizer has been initialized.
								// This ensures that its standard static crawling to identify libraries to optimize still happens.
								// If you don't call `init()` then the calls to `registerMissingImport()` appear to cancel the static crawling.
								await environment.depsOptimizer?.init();

								// Register every unenv-preset entry-point with the dependency optimizer upfront before the first request.
								// Without this the dependency optimizer will try to bundle them on-the-fly in the middle of the first request.
								// That can potentially cause problems if it causes previously optimized bundles to become stale and need to be bundled.
								return Array.from(nodeCompatEntries).map((entry) => {
									const result = resolveNodeJSImport(entry);
									if (result) {
										const registration =
											environment.depsOptimizer?.registerMissingImport(
												result.unresolved,
												result.resolved
											);
										return registration?.processing;
									}
								});
							}
						}
					)
				);
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
					pluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(viteDevServer);
				}

				const workerNames =
					resolvedPluginConfig.type === "assets-only"
						? []
						: Object.values(resolvedPluginConfig.workers).map(
								(worker) => worker.name
							);

				viteDevServer.middlewares.use(async (req, res, next) => {
					const resolvedInspectorPort =
						await getResolvedInspectorPort(pluginConfig);
					if (req.url === debuggingPath && resolvedInspectorPort) {
						const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
						res.setHeader("Content-Type", "text/html");
						return res.end(html);
					}
					next();
				});
			},
			async configurePreviewServer(vitePreviewServer) {
				const workerConfigs = getWorkerConfigs(vitePreviewServer.config.root);

				if (workerConfigs.length >= 1 && pluginConfig.inspectorPort !== false) {
					addDebugToVitePrintUrls(vitePreviewServer);
				}

				const workerNames = workerConfigs.map((worker) => {
					assert(worker.name, "Expected the Worker to have a name");
					return worker.name;
				});

				vitePreviewServer.middlewares.use(async (req, res, next) => {
					const resolvedInspectorPort =
						await getResolvedInspectorPort(pluginConfig);

					if (req.url === debuggingPath && resolvedInspectorPort) {
						const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
						res.setHeader("Content-Type", "text/html");
						return res.end(html);
					}
					next();
				});
			},
		},
		// Plugin to warn if Node.js APIs are being used without nodejs_compat turned on
		{
			name: "vite-plugin-cloudflare:nodejs-compat-warnings",
			apply(_config, env) {
				// Skip this whole plugin if we are in preview mode
				return !env.isPreview;
			},
			// We must ensure that the `resolveId` hook runs before the built-in ones.
			// Otherwise we never see the Node.js built-in imports since they get handled by default Vite behavior.
			enforce: "pre",
			configEnvironment(environmentName) {
				const workerConfig = getWorkerConfig(environmentName);

				if (workerConfig && !isNodeCompat(workerConfig)) {
					return {
						optimizeDeps: {
							esbuildOptions: {
								plugins: [
									{
										name: "vite-plugin-cloudflare:nodejs-compat-warnings-resolver",
										setup(build) {
											build.onResolve(
												{ filter: NODEJS_MODULES_RE },
												({ path, importer }) => {
													const nodeJsCompatWarnings =
														nodeJsCompatWarningsMap.get(workerConfig);
													nodeJsCompatWarnings?.registerImport(path, importer);
													// Mark this path as external to avoid messy unwanted resolve errors.
													// It will fail at runtime but we will log warnings to the user.
													return { path, external: true };
												}
											);
										},
									},
								],
							},
						},
					};
				}
			},
			configResolved(resolvedViteConfig) {
				for (const environmentName of Object.keys(
					resolvedViteConfig.environments
				)) {
					const workerConfig = getWorkerConfig(environmentName);

					if (workerConfig && !isNodeCompat(workerConfig)) {
						nodeJsCompatWarningsMap.set(
							workerConfig,
							new NodeJsCompatWarnings(environmentName, resolvedViteConfig)
						);
					}
				}
			},
			async resolveId(source, importer) {
				const workerConfig = getWorkerConfig(this.environment.name);

				if (workerConfig && !isNodeCompat(workerConfig)) {
					const nodeJsCompatWarnings =
						nodeJsCompatWarningsMap.get(workerConfig);

					if (nodejsBuiltins.has(source)) {
						nodeJsCompatWarnings?.registerImport(source, importer);

						// Mark this path as external to avoid messy unwanted resolve errors.
						// It will fail at runtime but we will log warnings to the user.
						return {
							id: source,
							external: true,
						};
					}
				}
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
 * Gets the inspector port option that should be passed to miniflare based on the user's plugin config
 *
 * @param pluginConfig the user plugin configs
 * @param viteServer the vite (dev or preview) server
 * @returns the inspector port to require from miniflare or false if debugging is disabled
 */
async function getInputInspectorPortOption(
	pluginConfig: PluginConfig,
	viteServer: vite.ViteDevServer | vite.PreviewServer
) {
	const inputInspectorPort =
		pluginConfig.inspectorPort ??
		(await getFirstAvailablePort(DEFAULT_INSPECTOR_PORT));

	if (
		pluginConfig.inspectorPort === undefined &&
		inputInspectorPort !== DEFAULT_INSPECTOR_PORT
	) {
		viteServer.config.logger.warn(
			colors.dim(
				`Default inspector port ${DEFAULT_INSPECTOR_PORT} not available, using ${inputInspectorPort} instead\n`
			)
		);
	}

	return inputInspectorPort;
}

/**
 * Gets the resolved port of the inspector provided by miniflare
 *
 * @param pluginConfig the user's plugin configuration
 * @returns the resolved port of null if the user opted out of debugging
 */
async function getResolvedInspectorPort(pluginConfig: PluginConfig) {
	if (miniflare && pluginConfig.inspectorPort !== false) {
		const miniflareInspectorUrl = await miniflare.getInspectorURL();
		return Number.parseInt(miniflareInspectorUrl.port);
	}
	return null;
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
