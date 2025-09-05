import assert from "node:assert";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as util from "node:util";
import {
	cleanupContainers,
	generateContainerBuildId,
	resolveDockerHost,
} from "@cloudflare/containers-shared/src/utils";
import { generateStaticRoutingRuleMatcher } from "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine";
import MagicString from "magic-string";
import { CoreHeaders, Miniflare } from "miniflare";
import colors from "picocolors";
import * as vite from "vite";
import {
	createModuleReference,
	matchAdditionalModule,
} from "./additional-modules";
import { hasAssetsConfigChanged } from "./asset-config";
import { createBuildApp } from "./build";
import {
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
	initRunners,
} from "./cloudflare-environment";
import {
	ASSET_WORKER_NAME,
	DEBUG_PATH,
	kRequestType,
	ROUTER_WORKER_NAME,
} from "./constants";
import { getDockerPath, prepareContainerImages } from "./containers";
import {
	addDebugToVitePrintUrls,
	getDebugPathHtml,
	getInputInspectorPortOption,
	getResolvedInspectorPort,
} from "./debugging";
import { writeDeployConfig } from "./deploy-config";
import {
	getLocalDevVarsForPreview,
	hasLocalDevVarsFileChanged,
} from "./dev-vars";
import {
	getDevMiniflareOptions,
	getEntryWorkerConfig,
	getPreviewMiniflareOptions,
} from "./miniflare-options";
import {
	assertHasNodeJsCompat,
	hasNodeJsAls,
	isNodeAlsModule,
	NODEJS_MODULES_RE,
	nodeJsBuiltins,
	NodeJsCompatWarnings,
} from "./nodejs-compat";
import {
	assertIsNotPreview,
	assertIsPreview,
	resolvePluginConfig,
} from "./plugin-config";
import { additionalModuleGlobalRE, UNKNOWN_HOST } from "./shared";
import { cleanUrl, createRequestHandler, getOutputDirectory } from "./utils";
import { validateWorkerEnvironmentOptions } from "./vite-config";
import { handleWebSocket } from "./websockets";
import { getWarningForWorkersConfigs } from "./workers-configs";
import type {
	PluginConfig,
	ResolvedPluginConfig,
	WorkerConfig,
} from "./plugin-config";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type { Unstable_RawConfig } from "wrangler";

export type { PluginConfig } from "./plugin-config";

const debuglog = util.debuglog("@cloudflare:vite-plugin");

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
	let containerImageTagsSeen = new Set<string>();

	/** Used to track whether hooks are being called because of a server restart or a server close event. */
	let restartingServer = false;

	return [
		{
			name: "vite-plugin-cloudflare",
			// This only applies to this plugin so is safe to use while other plugins migrate to the Environment API
			sharedDuringBuild: true,
			// Vite `config` Hook
			// see https://vite.dev/guide/api-plugin.html#config
			config(userConfig, env) {
				resolvedPluginConfig = resolvePluginConfig(
					pluginConfig,
					userConfig,
					env
				);

				if (resolvedPluginConfig.type === "preview") {
					return { appType: "custom" };
				}

				if (!workersConfigsWarningShown) {
					workersConfigsWarningShown = true;
					const workersConfigsWarning = getWarningForWorkersConfigs(
						resolvedPluginConfig.rawConfigs
					);
					if (workersConfigsWarning) {
						console.warn(workersConfigsWarning);
					}
				}

				const defaultDeniedFiles = [
					".env",
					".env.*",
					"*.{crt,pem}",
					"**/.git/**",
				];

				return {
					appType: "custom",
					server: {
						fs: {
							deny: [...defaultDeniedFiles, ".dev.vars", ".dev.vars.*"],
						},
					},
					environments:
						resolvedPluginConfig.type === "workers"
							? {
									...Object.fromEntries(
										Object.entries(resolvedPluginConfig.workers).map(
											([environmentName, workerConfig]) => {
												return [
													environmentName,
													createCloudflareEnvironmentOptions({
														workerConfig,
														userConfig,
														mode: env.mode,
														environmentName,
														isEntryWorker:
															resolvedPluginConfig.type === "workers" &&
															environmentName ===
																resolvedPluginConfig.entryWorkerEnvironmentName,
														hasNodeJsCompat:
															getNodeJsCompat(environmentName) !== undefined,
													}),
												];
											}
										)
									),
									client: {
										build: {
											outDir: getOutputDirectory(userConfig, "client"),
										},
										optimizeDeps: {
											// Some frameworks allow users to mix client and server code in the same file and then extract the server code.
											// As the dependency optimization may happen before the server code is extracted, we should exclude Cloudflare built-ins from client optimization.
											exclude: [...cloudflareBuiltInModules],
										},
									},
								}
							: undefined,
					builder: {
						buildApp:
							userConfig.builder?.buildApp ??
							createBuildApp(resolvedPluginConfig),
					},
				};
			},
			buildStart() {
				// This resets the value when the dev server restarts
				workersConfigsWarningShown = false;
			},
			// Vite `configResolved` Hook
			// see https://vite.dev/guide/api-plugin.html#configresolved
			configResolved(config) {
				resolvedViteConfig = config;

				if (resolvedPluginConfig.type === "workers") {
					validateWorkerEnvironmentOptions(
						resolvedPluginConfig,
						resolvedViteConfig
					);
				}
			},
			async transform(code, id) {
				const workerConfig = getWorkerConfig(this.environment.name);

				if (!workerConfig) {
					return;
				}

				const resolvedWorkerEntry = await this.resolve(workerConfig.main);

				if (id === resolvedWorkerEntry?.id) {
					const modified = new MagicString(code);
					const hmrCode = `
if (import.meta.hot) {
  import.meta.hot.accept();
}
						`;
					modified.append(hmrCode);

					return {
						code: modified.toString(),
						map: modified.generateMap({ hires: "boundary", source: id }),
					};
				}
			},
			generateBundle(_, bundle) {
				assertIsNotPreview(resolvedPluginConfig);

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

					if (isEntryWorker) {
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
						const localDevVars = getLocalDevVarsForPreview(
							workerConfig.configPath,
							resolvedPluginConfig.cloudflareEnv
						);
						// Save a .dev.vars file to the worker's build output directory if there are local dev vars, so that it will be then detected by `vite preview`.
						if (localDevVars) {
							this.emitFile({
								type: "asset",
								fileName: ".dev.vars",
								source: localDevVars,
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
				assertIsNotPreview(resolvedPluginConfig);

				// These conditions ensure the deploy config is emitted once per application build as `writeBundle` is called for each environment.
				// If Vite introduces an additional hook that runs after the application has built then we could use that instead.
				if (
					this.environment.name ===
					(resolvedPluginConfig.type === "workers"
						? resolvedPluginConfig.entryWorkerEnvironmentName
						: "client")
				) {
					writeDeployConfig(resolvedPluginConfig, resolvedViteConfig);
				}
			},
			// Vite `configureServer` Hook
			// see https://vite.dev/guide/api-plugin.html#configureserver
			async configureServer(viteDevServer) {
				// Patch the `server.restart` method to track whether the server is restarting or not.
				const restartServer = viteDevServer.restart.bind(viteDevServer);
				viteDevServer.restart = async () => {
					try {
						restartingServer = true;
						debuglog("From server.restart(): Restarting server...");
						await restartServer();
						debuglog("From server.restart(): Restarted server...");
					} finally {
						restartingServer = false;
					}
				};

				assertIsNotPreview(resolvedPluginConfig);

				const inputInspectorPort = await getInputInspectorPortOption(
					resolvedPluginConfig,
					viteDevServer,
					miniflare
				);

				const configChangedHandler = async (changedFilePath: string) => {
					assertIsNotPreview(resolvedPluginConfig);

					if (
						resolvedPluginConfig.configPaths.has(changedFilePath) ||
						hasLocalDevVarsFileChanged(resolvedPluginConfig, changedFilePath) ||
						hasAssetsConfigChanged(
							resolvedPluginConfig,
							resolvedViteConfig,
							changedFilePath
						)
					) {
						debuglog("Config changed: " + changedFilePath);
						viteDevServer.watcher.off("change", configChangedHandler);
						debuglog("Restarting dev server and aborting previous setup");
						await viteDevServer.restart();
					}
				};
				viteDevServer.watcher.on("change", configChangedHandler);

				let containerBuildId: string | undefined;
				const entryWorkerConfig = getEntryWorkerConfig(resolvedPluginConfig);
				const hasDevContainers =
					entryWorkerConfig?.containers?.length &&
					entryWorkerConfig.dev.enable_containers;
				const dockerPath = getDockerPath();

				if (hasDevContainers) {
					containerBuildId = generateContainerBuildId();
					entryWorkerConfig.dev.container_engine =
						resolveDockerHost(dockerPath);
				}

				const miniflareDevOptions = await getDevMiniflareOptions({
					resolvedPluginConfig,
					viteDevServer,
					inspectorPort: inputInspectorPort,
					containerBuildId,
				});

				if (!miniflare) {
					debuglog("Creating new Miniflare instance");
					miniflare = new Miniflare(miniflareDevOptions);
				} else {
					debuglog("Updating the existing Miniflare instance");
					await miniflare.setOptions(miniflareDevOptions);
					debuglog("Miniflare is ready");
				}

				let preMiddleware: vite.Connect.NextHandleFunction | undefined;

				if (resolvedPluginConfig.type === "workers") {
					assert(entryWorkerConfig, `No entry Worker config`);

					debuglog("Initializing the Vite module runners");
					await initRunners(resolvedPluginConfig, viteDevServer, miniflare);

					const entryWorkerName = entryWorkerConfig.name;

					// The HTTP server is not available in middleware mode
					if (viteDevServer.httpServer) {
						handleWebSocket(viteDevServer.httpServer, async () => {
							assert(miniflare, `Miniflare not defined`);
							const entryWorker = await miniflare.getWorker(entryWorkerName);

							return entryWorker.fetch;
						});
					}

					const staticRouting: StaticRouting | undefined =
						entryWorkerConfig.assets?.run_worker_first === true
							? { user_worker: ["/*"] }
							: resolvedPluginConfig.staticRouting;

					if (staticRouting) {
						const excludeRulesMatcher = generateStaticRoutingRuleMatcher(
							staticRouting.asset_worker ?? []
						);
						const includeRulesMatcher = generateStaticRoutingRuleMatcher(
							staticRouting.user_worker
						);
						const userWorkerHandler = createRequestHandler(async (request) => {
							assert(miniflare, `Miniflare not defined`);
							const userWorker = await miniflare.getWorker(entryWorkerName);

							return userWorker.fetch(request, { redirect: "manual" });
						});

						preMiddleware = async (req, res, next) => {
							assert(req.url, `req.url not defined`);
							// Only the URL pathname is used to match rules
							const request = new Request(new URL(req.url, UNKNOWN_HOST));

							if (req[kRequestType] === "asset") {
								next();
							} else if (excludeRulesMatcher({ request })) {
								req[kRequestType] === "asset";
								next();
							} else if (includeRulesMatcher({ request })) {
								userWorkerHandler(req, res, next);
							} else {
								next();
							}
						};
					}

					if (hasDevContainers) {
						viteDevServer.config.logger.info(
							colors.dim(
								colors.yellow(
									"∷ Building container images for local development...\n"
								)
							)
						);
						containerImageTagsSeen = await prepareContainerImages({
							containersConfig: entryWorkerConfig.containers,
							containerBuildId,
							isContainersEnabled: entryWorkerConfig.dev.enable_containers,
							dockerPath,
							configPath: entryWorkerConfig.configPath,
						});
						viteDevServer.config.logger.info(
							colors.dim(
								colors.yellow(
									"\n⚡️ Containers successfully built. To rebuild your containers during development, restart the Vite dev server (r + enter)."
								)
							)
						);

						/*
						 * Upon exiting the dev process we should ensure we perform any
						 * containers-specific cleanup work. Vite recommends using the
						 * `buildEnd` and `closeBundle` hooks, which are called when the
						 * server is closed. Unfortunately none of these hooks work if the
						 * process exits forcefully, via `ctrl+C`, and Vite provides no
						 * other alternatives. For this reason we decided to hook into both
						 * `buildEnd` and the `exit` event, and ensure we always cleanup
						 * (please note that handling the `beforeExit` event, which does
						 * support async ops, is not an option, since Vite calls
						 * `process.exit()` imperatively, and therefore causes `beforeExit`
						 * not to be emitted).
						 *
						 */
						process.on("exit", async () => {
							if (containerImageTagsSeen.size) {
								cleanupContainers(dockerPath, containerImageTagsSeen);
							}
						});
					}
				}

				return () => {
					if (preMiddleware) {
						const middlewareStack = viteDevServer.middlewares.stack;
						const cachedTransformMiddlewareIndex = middlewareStack.findIndex(
							(middleware) =>
								"name" in middleware.handle &&
								middleware.handle.name === "viteCachedTransformMiddleware"
						);
						assert(
							cachedTransformMiddlewareIndex !== -1,
							"Failed to find viteCachedTransformMiddleware"
						);

						// Insert our middleware after the host check middleware to prevent DNS rebinding attacks
						middlewareStack.splice(cachedTransformMiddlewareIndex, 0, {
							route: "",
							handle: preMiddleware,
						});
					}

					// post middleware
					viteDevServer.middlewares.use(
						createRequestHandler(async (request, req) => {
							assert(miniflare, `Miniflare not defined`);

							if (req[kRequestType] === "asset") {
								const assetWorker =
									await miniflare.getWorker(ASSET_WORKER_NAME);

								return assetWorker.fetch(request, { redirect: "manual" });
							} else {
								const routerWorker =
									await miniflare.getWorker(ROUTER_WORKER_NAME);

								return routerWorker.fetch(request, {
									redirect: "manual",
								});
							}
						})
					);
				};
			},
			// Vite `configurePreviewServer` Hook
			// see https://vite.dev/guide/api-plugin.html#configurepreviewserver
			async configurePreviewServer(vitePreviewServer) {
				assertIsPreview(resolvedPluginConfig);

				const inputInspectorPort = await getInputInspectorPortOption(
					resolvedPluginConfig,
					vitePreviewServer
				);

				// first Worker in the Array is always the entry Worker
				const entryWorkerConfig = resolvedPluginConfig.workers[0];
				const hasDevContainers =
					entryWorkerConfig?.containers?.length &&
					entryWorkerConfig.dev.enable_containers;
				let containerBuildId: string | undefined;

				if (hasDevContainers) {
					containerBuildId = generateContainerBuildId();
				}

				miniflare = new Miniflare(
					await getPreviewMiniflareOptions({
						resolvedPluginConfig,
						vitePreviewServer,
						inspectorPort: inputInspectorPort,
						containerBuildId,
					})
				);

				if (hasDevContainers) {
					const dockerPath = getDockerPath();

					vitePreviewServer.config.logger.info(
						colors.dim(
							colors.yellow(
								"∷ Building container images for local preview...\n"
							)
						)
					);
					containerImageTagsSeen = await prepareContainerImages({
						containersConfig: entryWorkerConfig.containers,
						containerBuildId,
						isContainersEnabled: entryWorkerConfig.dev.enable_containers,
						dockerPath,
						configPath: entryWorkerConfig.configPath,
					});
					vitePreviewServer.config.logger.info(
						colors.dim(colors.yellow("\n⚡️ Containers successfully built.\n"))
					);

					process.on("exit", () => {
						if (containerImageTagsSeen.size) {
							cleanupContainers(dockerPath, containerImageTagsSeen);
						}
					});
				}

				handleWebSocket(vitePreviewServer.httpServer, () => {
					assert(miniflare, `Miniflare not defined`);

					return miniflare.dispatchFetch;
				});

				// In preview mode we put our middleware at the front of the chain so that all assets are handled in Miniflare
				vitePreviewServer.middlewares.use(
					createRequestHandler((request) => {
						assert(miniflare, `Miniflare not defined`);

						return miniflare.dispatchFetch(request, { redirect: "manual" });
					})
				);
			},
			async buildEnd() {
				if (
					resolvedViteConfig.command === "serve" &&
					containerImageTagsSeen?.size
				) {
					const dockerPath = getDockerPath();
					cleanupContainers(dockerPath, containerImageTagsSeen);
				}

				debuglog("buildEnd:", restartingServer ? "restarted" : "disposing");
				if (!restartingServer) {
					debuglog("buildEnd: disposing Miniflare instance");
					await miniflare?.dispose().catch((error) => {
						debuglog("buildEnd: failed to dispose Miniflare instance:", error);
					});
					miniflare = undefined;
				}
			},
		},
		// Plugin to provide a fallback entry file
		{
			name: "vite-plugin-cloudflare:fallback-entry",
			resolveId(source) {
				if (source === "virtual:__cloudflare_fallback_entry__") {
					return `\0virtual:__cloudflare_fallback_entry__`;
				}
			},
			load(id) {
				if (id === "\0virtual:__cloudflare_fallback_entry__") {
					return ``;
				}
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
			configEnvironment(name) {
				const nodeJsCompat = getNodeJsCompat(name);

				// Only configure this environment if it is a Worker using Node.js compatibility.
				if (nodeJsCompat) {
					return {
						resolve: {
							builtins: [...nodeJsCompat.externals],
						},
						optimizeDeps: {
							// This is a list of module specifiers that the dependency optimizer should not follow when doing import analysis.
							// In this case we provide a list of all the Node.js modules, both those built-in to workerd and those that will be polyfilled.
							// Obviously we don't want/need the optimizer to try to process modules that are built-in;
							// But also we want to avoid following the ones that are polyfilled since the dependency-optimizer import analyzer does not
							// resolve these imports using our `resolveId()` hook causing the optimization step to fail.
							exclude: [...nodeJsBuiltins],
						},
					};
				}
			},
			applyToEnvironment(environment) {
				// Only run this plugin's hooks if it is a Worker with Node.js compatibility.
				return getNodeJsCompat(environment.name) !== undefined;
			},
			// We need the resolver from this plugin to run before built-in ones, otherwise Vite's built-in
			// resolver will try to externalize the Node.js module imports (e.g. `perf_hooks` and `node:tty`)
			// rather than allowing the resolve hook here to alias them to polyfills.
			enforce: "pre",
			async resolveId(source, importer, options) {
				const nodeJsCompat = getNodeJsCompat(this.environment.name);
				assertHasNodeJsCompat(nodeJsCompat);

				if (nodeJsCompat.isGlobalVirtualModule(source)) {
					return source;
				}

				// See if we can map the `source` to a Node.js compat alias.
				const result = nodeJsCompat.resolveNodeJsImport(source);

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
			load(id) {
				const nodeJsCompat = getNodeJsCompat(this.environment.name);
				assertHasNodeJsCompat(nodeJsCompat);

				return nodeJsCompat.getGlobalVirtualModule(id);
			},
			async transform(code, id) {
				// Inject the Node.js compat globals into the entry module for Node.js compat environments.
				const workerConfig = getWorkerConfig(this.environment.name);

				if (!workerConfig) {
					return;
				}

				const resolvedId = await this.resolve(workerConfig.main);

				if (id === resolvedId?.id) {
					const nodeJsCompat = getNodeJsCompat(this.environment.name);
					assertHasNodeJsCompat(nodeJsCompat);

					return nodeJsCompat.injectGlobalCode(id, code);
				}
			},
			async configureServer(viteDevServer) {
				// Pre-optimize Node.js compat library entry-points for those environments that need it.
				await Promise.all(
					Object.values(viteDevServer.environments).flatMap(
						async (environment) => {
							const nodeJsCompat = getNodeJsCompat(environment.name);

							if (nodeJsCompat) {
								// Make sure that the dependency optimizer has been initialized.
								// This ensures that its standard static crawling to identify libraries to optimize still happens.
								// If you don't call `init()` then the calls to `registerMissingImport()` appear to cancel the static crawling.
								await environment.depsOptimizer?.init();

								// Register every unenv-preset entry-point with the dependency optimizer upfront before the first request.
								// Without this the dependency optimizer will try to bundle them on-the-fly in the middle of the first request.
								// That can potentially cause problems if it causes previously optimized bundles to become stale and need to be bundled.
								return Array.from(nodeJsCompat.entries).map((entry) => {
									const result = nodeJsCompat.resolveNodeJsImport(entry);

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
		// Plugin that handles Node.js Async Local Storage (ALS) compatibility support for Vite Environments that are hosted in Cloudflare Workers.
		{
			name: "vite-plugin-cloudflare:nodejs-als",
			configEnvironment(name) {
				if (hasNodeJsAls(getWorkerConfig(name))) {
					return {
						resolve: {
							builtins: ["async_hooks", "node:async_hooks"],
						},
						optimizeDeps: {
							exclude: ["async_hooks", "node:async_hooks"],
						},
					};
				}
			},
		},
		// Plugin to warn if Node.js APIs are being used without nodejs_compat turned on
		{
			name: "vite-plugin-cloudflare:nodejs-compat-warnings",
			// We must ensure that the `resolveId` hook runs before the built-in ones.
			// Otherwise we never see the Node.js built-in imports since they get handled by default Vite behavior.
			enforce: "pre",
			configEnvironment(environmentName) {
				const workerConfig = getWorkerConfig(environmentName);
				const nodeJsCompat = getNodeJsCompat(environmentName);

				if (workerConfig && !nodeJsCompat) {
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
													if (
														hasNodeJsAls(workerConfig) &&
														isNodeAlsModule(path)
													) {
														// Skip if this is just async_hooks and Node.js ALS support is on.
														return;
													}

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
					const nodeJsCompat = getNodeJsCompat(environmentName);

					if (workerConfig && !nodeJsCompat) {
						nodeJsCompatWarningsMap.set(
							workerConfig,
							new NodeJsCompatWarnings(environmentName, resolvedViteConfig)
						);
					}
				}
			},
			async resolveId(source, importer) {
				const workerConfig = getWorkerConfig(this.environment.name);
				const nodeJsCompat = getNodeJsCompat(this.environment.name);

				if (workerConfig && !nodeJsCompat) {
					if (hasNodeJsAls(workerConfig) && isNodeAlsModule(source)) {
						// Skip if this is just async_hooks and Node.js ALS support is on.
						return;
					}

					const nodeJsCompatWarnings =
						nodeJsCompatWarningsMap.get(workerConfig);

					if (nodeJsBuiltins.has(source)) {
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
		// Plugin that provides an __debug path for debugging the Cloudflare Workers.
		{
			name: "vite-plugin-cloudflare:debug",
			// Note: this plugin needs to run before the main vite-plugin-cloudflare so that
			//       the preview middleware here can take precedence
			enforce: "pre",
			configureServer(viteDevServer) {
				assertIsNotPreview(resolvedPluginConfig);
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;
				if (inVscodeJsDebugTerminal) {
					return;
				}

				if (
					resolvedPluginConfig.type === "workers" &&
					pluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(viteDevServer);
				}

				const workerNames =
					resolvedPluginConfig.type === "workers"
						? Object.values(resolvedPluginConfig.workers).map(
								(worker) => worker.name
							)
						: [];

				viteDevServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
					const resolvedInspectorPort = await getResolvedInspectorPort(
						resolvedPluginConfig,
						miniflare
					);

					if (resolvedInspectorPort) {
						const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
						res.setHeader("Content-Type", "text/html");
						res.end(html);
					} else {
						next();
					}
				});
			},
			async configurePreviewServer(vitePreviewServer) {
				assertIsPreview(resolvedPluginConfig);
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;
				if (inVscodeJsDebugTerminal) {
					return;
				}

				if (
					resolvedPluginConfig.workers.length >= 1 &&
					resolvedPluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(vitePreviewServer);
				}

				const workerNames = resolvedPluginConfig.workers.map((worker) => {
					assert(worker.name, "Expected the Worker to have a name");
					return worker.name;
				});

				vitePreviewServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
					const resolvedInspectorPort = await getResolvedInspectorPort(
						resolvedPluginConfig,
						miniflare
					);

					if (resolvedInspectorPort) {
						const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
						res.setHeader("Content-Type", "text/html");
						res.end(html);
					} else {
						next();
					}
				});
			},
		},
		// Plugin to handle cron/email/etc triggers
		{
			name: "vite-plugin-cloudflare:trigger-handlers",
			enforce: "pre",
			async configureServer(viteDevServer) {
				assertIsNotPreview(resolvedPluginConfig);

				if (resolvedPluginConfig.type === "workers") {
					const entryWorkerConfig = getEntryWorkerConfig(resolvedPluginConfig);
					assert(entryWorkerConfig, `No entry Worker config`);

					const entryWorkerName = entryWorkerConfig.name;

					// cron && email triggers
					viteDevServer.middlewares.use("/cdn-cgi/", (req, res, next) => {
						const requestHandler = createRequestHandler((request) => {
							assert(miniflare, `Miniflare not defined`);

							// set the target service that handles these requests
							// to point to the User Worker (see `getTargetService` fn in
							// `packages/miniflare/src/workers/core/entry.worker.ts`)
							request.headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
							return miniflare.dispatchFetch(request, { redirect: "manual" });
						});

						// `req.url` is the URL of the request relative to the middleware
						// mount path. Here we ensure that miniflare receives a request that
						// reflects the original request url
						req.url = req.originalUrl;
						requestHandler(req, res, next);
					});
				}
			},
		},
	];

	/**
	 * Returns the Worker config for the given environment if it is a Worker environment
	 */
	function getWorkerConfig(environmentName: string) {
		return resolvedPluginConfig.type === "workers"
			? resolvedPluginConfig.workers[environmentName]
			: undefined;
	}

	/**
	 * Returns the `NodeJsCompat` instance for the given environment if it has `nodejs_compat` enabled
	 */
	function getNodeJsCompat(environmentName: string) {
		return resolvedPluginConfig.type === "workers"
			? resolvedPluginConfig.nodeJsCompatMap.get(environmentName)
			: undefined;
	}
}
