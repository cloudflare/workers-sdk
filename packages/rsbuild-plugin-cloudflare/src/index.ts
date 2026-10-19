import assert from "node:assert";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	BUILD_OUTPUT_ROOT,
	cleanBuildOutputDir,
	DEFAULT_WORKER_DIRECTORY_NAME,
	getWorkerAssetsDir,
	writeRootConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import {
	createDebugMiddleware,
	createRequestHandler,
	createStaticRoutingMiddleware,
	DEBUG_PATH,
	DevMiniflareLogger,
	dispatchDevRequest,
	getAssetsConfig,
	getCommonMiniflareOptions,
	getDevAssetWorkerOptions,
	getDevUserWorkerOptions,
	getPreviewMiniflareOptions,
	handleWebSocket,
	isPreviewBuild,
	moveImportedAssets,
	readBuildOutputPreview,
	resolveDevOnly,
	resolveInspectorPort,
	resolveLocalBindingsByWorkerName,
	resolvePluginConfig,
	resolveStaticRouting,
	warnForMissingSecrets,
} from "@cloudflare/workers-dev-shared";
import {
	getDevVarsCandidatePaths,
	getEnvPaths,
} from "@cloudflare/workers-utils/local-env";
import { CoreHeaders, Miniflare } from "miniflare";
import {
	getAdditionalModuleTypes,
	getImportedAssetPaths,
	getManifestFromCompilation,
	getWorkerEntry,
	getWorkerEnvironmentConfig,
	removeUnemittedFiles,
} from "./worker-environment";
import type {
	DevHtmlHandlers,
	IncomingMessage,
	PluginConfig,
	ResolvedPluginConfig,
	Worker,
} from "@cloudflare/workers-dev-shared";
import type {
	EnvironmentContext,
	PublicDir,
	RsbuildDevServer,
	RsbuildPlugin,
} from "@rsbuild/core";
import type { MiniflareOptions, WorkerOptions } from "miniflare";

/** The same options as the Vite plugin's `cloudflare()`, apart from the tunnel. */
export interface PluginCloudflareOptions extends Omit<PluginConfig, "tunnel"> {
	/** The directory to load `.env` and `.dev.vars` files from, or `false` to skip them. Defaults to the project root. */
	envDir?: string | false;
	/** The mode used to load `cloudflare.config.ts`, `.env.[mode]` and `.dev.vars.[mode]`. Defaults to Rsbuild's mode. */
	envMode?: string;
}

/** The Rsbuild environment that builds the entry Worker. */
const ENVIRONMENT_NAME = "cloudflare";

type MiniflareManifest = NonNullable<WorkerOptions["config"]["manifest"]>;

/**
 * Rsbuild plugin that builds the Workers defined in `cloudflare.config.ts` and
 * the plugin options with rspack and runs them in workerd (via Miniflare)
 * during `rsbuild dev`. `rsbuild build` writes the Build Output Specification
 * to `.cloudflare/output`, which `rsbuild preview` runs in workerd.
 *
 * @param options Plugin options.
 * @returns An Rsbuild plugin.
 */
export function pluginCloudflare(
	options: PluginCloudflareOptions = {}
): RsbuildPlugin {
	return {
		name: "rsbuild:cloudflare",
		setup(api) {
			const { action, rootPath: root } = api.context;
			let mode = "development";
			let resolvedPluginConfig: ResolvedPluginConfig;
			/** The Workers to bundle, keyed by Rsbuild environment name, with the entry Worker first. */
			const workerEnvironments = new Map<string, Worker>();
			/** The latest bundles, keyed by Rsbuild environment name. */
			const manifests = new Map<string, MiniflareManifest>();
			let manifestsChanged = false;
			/** The assets that the entry Worker imports, which a build moves to the client output. */
			let importedAssets: { distPath: string; paths: string[] } | undefined;
			/** The Worker environments whose latest dev build failed. */
			const failedEnvironments = new Set<string>();
			let devServer: RsbuildDevServer | undefined;
			let environmentContexts: Record<string, EnvironmentContext> = {};
			let miniflare: Miniflare | undefined;
			let inspectorPort: number | false = false;
			/** Why Miniflare last failed to start or update, which requests report. */
			let miniflareError: unknown;
			let settleFirstStart: () => void = () => {};
			/** Settles once Miniflare has first started, or failed to. */
			const firstStart = new Promise<void>((resolve) => {
				settleFirstStart = resolve;
			});
			let miniflareLogger: DevMiniflareLogger;

			api.modifyRsbuildConfig(async (userConfig, { mergeRsbuildConfig }) => {
				miniflareLogger = new DevMiniflareLogger(
					api.logger,
					userConfig.logLevel
				);
				mode =
					options.envMode ??
					userConfig.mode ??
					(action === "dev" ? "development" : "production");
				const envDir =
					options.envDir === false
						? false
						: path.resolve(root, options.envDir ?? ".");
				const preview =
					action === "preview"
						? await readBuildOutputPreview(root, false)
						: undefined;
				// Load the same `.env` files as the build.
				mode = preview?.rootConfig.buildContext.mode ?? mode;
				resolvedPluginConfig = await resolvePluginConfig(options, {
					root,
					mode,
					envDir,
					command: action === "build" ? "build" : "serve",
					preview,
				});

				if (resolvedPluginConfig.type === "preview") {
					// Preview runs the Build Output rather than the project's sources,
					// and Rsbuild checks that this directory exists before starting.
					return mergeRsbuildConfig(userConfig, {
						output: { distPath: { root: BUILD_OUTPUT_ROOT } },
					});
				}

				for (const worker of resolvedPluginConfig.environmentNameToWorkerMap.values()) {
					if (action !== "build" || !resolveDevOnly(worker.devOnly)) {
						workerEnvironments.set(getEnvironmentName(worker), worker);
					}
				}

				// Without explicit environments (Rsbuild defaults them to `{}`), Rsbuild
				// builds a single `web` environment from the top-level config, so keep
				// it when there is a client entry.
				const clientEnvironments = Object.fromEntries(
					Object.entries(userConfig.environments ?? {}).filter(
						([name]) => !workerEnvironments.has(name)
					)
				);
				const environments =
					Object.keys(clientEnvironments).length > 0
						? clientEnvironments
						: userConfig.source?.entry
							? { web: {} }
							: {};

				return mergeRsbuildConfig(userConfig, {
					environments: {
						...environments,
						...Object.fromEntries(
							[...workerEnvironments].map(([name, worker]) => [
								name,
								// The user's environment config overrides the defaults.
								mergeRsbuildConfig(
									getWorkerEnvironmentConfig(worker, root),
									userConfig.environments?.[name] ?? {}
								),
							])
						),
					},
					dev: {
						watchFiles: {
							paths: [
								...resolvedPluginConfig.configPaths,
								...getEnvPaths(envDir, mode),
								...getDevVarsCandidatePaths(envDir, mode),
								...(resolvedPluginConfig.experimental
									.headersAndRedirectsDevModeSupport
									? getPublicDirs(userConfig.server?.publicDir, root).flatMap(
											(dir) => [
												path.join(dir, "_headers"),
												path.join(dir, "_redirects"),
											]
										)
									: []),
							],
							type: "reload-server",
						},
					},
					server: {
						// The asset Worker handles HTML requests, as when deployed.
						htmlFallback: false,
						// Rsbuild only prints the server's URLs for client environments.
						...(Object.keys(environments).length === 0 &&
							userConfig.server?.printUrls === true && {
								printUrls: ({ urls }: { urls: string[] }) => urls,
							}),
					},
				});
			});

			api.modifyEnvironmentConfig((config, { name }) => {
				const worker = workerEnvironments.get(name);
				if (worker) {
					// Top-level entries are merged into every environment, so replace
					// them to keep client entries out of the Worker.
					config.source.entry = getWorkerEntry(worker, root);
				} else if (
					action === "build" &&
					resolvedPluginConfig.type !== "preview" &&
					config.output.target === "web"
				) {
					config.output.distPath.root = getWorkerAssetsDir(root);
				}
			});

			api.onBeforeStartDevServer(({ server, environments }) => {
				devServer = server;
				environmentContexts = environments;
				addServerHandlers(
					server,
					[...workerEnvironments.values()].map(({ config }) => config.name)
				);
				const entryWorker = workerEnvironments.get(ENVIRONMENT_NAME);
				if (entryWorker) {
					const userWorkerHandler = createRequestHandler(async (request) => {
						request.headers.set(
							CoreHeaders.ROUTE_OVERRIDE,
							entryWorker.config.name
						);
						return (await getMiniflare()).dispatchFetch(request, {
							redirect: "manual",
						});
					});
					const toUserWorker: Parameters<
						typeof createStaticRoutingMiddleware
					>[1] = (req, res, next) => void userWorkerHandler(req, res, next);
					// Local trigger routes (e.g. `/cdn-cgi/local/scheduled`) must reach
					// the entry Worker rather than the router Worker.
					server.middlewares.use("/cdn-cgi/local/", toUserWorker);
					const staticRouting =
						resolvedPluginConfig.type === "workers"
							? resolveStaticRouting(
									entryWorker.config,
									resolvedPluginConfig.staticRouting
								)
							: undefined;
					if (staticRouting) {
						server.middlewares.use(
							createStaticRoutingMiddleware(staticRouting, toUserWorker)
						);
					}
				}
				// Rsbuild would serve its HTML pages itself, so send page requests to
				// the router Worker first.
				const hmrPath = api.getNormalizedConfig().dev.client.path;
				server.middlewares.use((req, res, next) =>
					isPageRequest(req, hmrPath)
						? void workerMiddleware(req, res, next)
						: next()
				);
				// Runs after Rsbuild's built-in middleware, so client assets are
				// served first and every other request is handled by the router Worker.
				return () => {
					server.middlewares.use(workerMiddleware);
				};
			});

			api.onBeforeBuild({
				// Runs before Rsbuild empties the output directories and copies
				// `public/` into them, so that the copies aren't removed.
				order: "pre",
				async handler({ isFirstCompile }) {
					if (isFirstCompile) {
						// As in the Vite plugin, drop Workers and Containers from
						// previous builds.
						await cleanBuildOutputDir(root);
					}
				},
			});

			api.onAfterEnvironmentCompile(async ({ environment, stats }) => {
				if (!workerEnvironments.has(environment.name) || !stats) {
					return;
				}
				if (stats.hasErrors()) {
					failedEnvironments.add(environment.name);
					return;
				}
				failedEnvironments.delete(environment.name);
				manifests.set(environment.name, {
					...getManifestFromCompilation(stats.compilation),
					modulesRoot: environment.distPath,
				});
				manifestsChanged = true;
				if (action === "build") {
					await removeUnemittedFiles(environment.distPath, stats.compilation);
					if (environment.name === ENVIRONMENT_NAME) {
						importedAssets = {
							distPath: environment.distPath,
							paths: getImportedAssetPaths(stats.compilation),
						};
					}
				}
			});

			api.onAfterDevCompile(async () => {
				if (failedEnvironments.size > 0) {
					miniflareError = new Error(
						"The Worker failed to build. See the dev server output for details."
					);
					settleFirstStart();
					return;
				}
				// Miniflare runs every Worker, so wait until they have all built, and
				// don't restart it when only client code changed.
				if (
					(miniflare && !manifestsChanged) ||
					manifests.size < workerEnvironments.size
				) {
					return;
				}
				manifestsChanged = false;
				try {
					await startOrUpdateMiniflare(await getDevMiniflareOptions());
					miniflareError = undefined;
				} catch (error) {
					// Keep the dev server running, so that fixing the Worker retries.
					miniflareError = error;
					api.logger.error(error);
				}
				settleFirstStart();
			});

			api.onCloseDevServer(async () => {
				await miniflare?.dispose();
			});

			api.onBeforeStartPreviewServer(async ({ server }) => {
				if (resolvedPluginConfig.type !== "preview") {
					return;
				}
				inspectorPort = await getInspectorPort();
				const { miniflareOptions } = await getPreviewMiniflareOptions({
					resolvedPluginConfig,
					root,
					mode,
					logger: api.logger,
					miniflareLogger,
					inspectorPort,
					publicUrl: undefined,
				});
				await startOrUpdateMiniflare(miniflareOptions);
				settleFirstStart();
				// Rsbuild has no preview close hook, so dispose with the HTTP server.
				server.httpServer?.on("close", () => void miniflare?.dispose());
				addServerHandlers(
					server,
					miniflareOptions.workers.map(({ config }) => config.name)
				);
				// Added before Rsbuild's built-in middleware, so that Miniflare serves
				// the assets as well, as it would when deployed.
				server.middlewares.use(workerMiddleware);
			});

			api.onAfterBuild(async ({ stats }) => {
				if (resolvedPluginConfig.type === "preview" || stats?.hasErrors()) {
					return;
				}
				const assetsDir = getWorkerAssetsDir(root);
				if (!fs.existsSync(assetsDir)) {
					// Without a client entry there's no web environment to copy
					// `public/` into the assets directory, as Vite's client build does.
					for (const { name, copyOnBuild } of api.getNormalizedConfig().server
						.publicDir) {
						// Rsbuild normalizes `name` to an absolute path.
						if (copyOnBuild && fs.existsSync(name)) {
							await fsp.cp(name, assetsDir, { recursive: true });
						}
					}
				}
				if (importedAssets) {
					// As in the Vite plugin, serve assets that the entry Worker imports.
					moveImportedAssets(
						importedAssets.paths,
						importedAssets.distPath,
						assetsDir
					);
				}
				if (resolvedPluginConfig.type === "assets-only") {
					await writeWorkerConfig({
						root,
						config: resolvedPluginConfig.config,
					});
				}
				for (const worker of resolvedPluginConfig.environmentNameToWorkerMap.values()) {
					if (!resolveDevOnly(worker.devOnly)) {
						const manifest = manifests.get(getEnvironmentName(worker));
						assert(
							manifest,
							`Expected Worker "${worker.config.name}" to be built`
						);
						await writeWorkerConfig({
							root,
							config: worker.config,
							manifest: {
								type: "partial",
								mainModule: manifest.mainModule,
								modules: getAdditionalModuleTypes(manifest.modules),
							},
							directoryName: worker.directoryName,
						});
					} else if (worker.directoryName === DEFAULT_WORKER_DIRECTORY_NAME) {
						// `assetsOnly`: the entry Worker runs in dev but deploys as assets.
						await writeWorkerConfig({ root, config: worker.config });
					}
				}
				await writeRootConfig(root, resolvedPluginConfig.settings, {
					isPreview: isPreviewBuild(),
					mode,
				});
			});

			async function startOrUpdateMiniflare(
				miniflareOptions: MiniflareOptions
			): Promise<void> {
				if (miniflare) {
					await miniflare.setOptions(miniflareOptions);
				} else {
					miniflare = new Miniflare(miniflareOptions);
					await miniflare.ready;
				}
			}

			async function getMiniflare(): Promise<Miniflare> {
				await firstStart;
				if (miniflareError || !miniflare) {
					throw miniflareError;
				}
				return miniflare;
			}

			/** Forwards a request to the router Worker, or to the asset Worker for asset requests. */
			const workerMiddleware = createRequestHandler(async (request, req) =>
				action === "dev"
					? dispatchDevRequest(await getMiniflare(), request, req)
					: (await getMiniflare()).dispatchFetch(request, {
							redirect: "manual",
						})
			);

			/** Reads HTML pages from Rsbuild for the asset Worker. */
			const htmlHandlers: DevHtmlHandlers = {
				async htmlExists(pathname) {
					return findHtmlEntry(pathname) || findPublicFile(pathname)
						? pathname
						: null;
				},
				async fetchHtml(pathname) {
					const entry = findHtmlEntry(pathname);
					const environment =
						entry && devServer?.environments[entry.environmentName];
					if (entry && environment) {
						return environment.getTransformedHtml(entry.entryName);
					}
					const publicFile = findPublicFile(pathname);
					if (!publicFile) {
						throw new Error(`No HTML found for "${pathname}".`);
					}
					return fsp.readFile(publicFile, "utf8");
				},
			};

			function findHtmlEntry(
				pathname: string
			): { environmentName: string; entryName: string } | undefined {
				const { base } = api.getNormalizedConfig().server;
				for (const [environmentName, { htmlPaths }] of Object.entries(
					environmentContexts
				)) {
					for (const [entryName, htmlPath] of Object.entries(htmlPaths)) {
						if (path.posix.join(base, htmlPath) === pathname) {
							return { environmentName, entryName };
						}
					}
				}
			}

			function findPublicFile(pathname: string): string | undefined {
				return getPublicDirs(api.getNormalizedConfig().server.publicDir, root)
					.map((dir) => path.join(dir, pathname))
					.find((file) =>
						fs.statSync(file, { throwIfNoEntry: false })?.isFile()
					);
			}

			/** Adds the `/__debug` page and forwards the Workers' WebSockets. */
			function addServerHandlers(
				server: Pick<RsbuildDevServer, "httpServer" | "middlewares">,
				workerNames: string[]
			): void {
				server.middlewares.use(
					DEBUG_PATH,
					createDebugMiddleware(workerNames, async () =>
						inspectorPort === false || !miniflare
							? null
							: Number((await miniflare.getInspectorURL()).port)
					)
				);
				const { httpServer } = server;
				if (httpServer) {
					// Rsbuild handles its own HMR upgrades on `dev.client.path`.
					const hmrPath = api.getNormalizedConfig().dev.client.path;
					void firstStart.then(
						() =>
							miniflare &&
							handleWebSocket(httpServer, miniflare, {
								isBundlerUpgrade: (_request, url) => url.pathname === hmrPath,
							})
					);
				}
			}

			function getInspectorPort(): Promise<number | false> {
				return resolveInspectorPort({
					inspectorPort: resolvedPluginConfig.inspectorPort,
					getPreviousPort: async () =>
						miniflare ? Number((await miniflare.getInspectorURL()).port) : null,
					logger: api.logger,
				});
			}

			async function getDevMiniflareOptions(): Promise<MiniflareOptions> {
				if (resolvedPluginConfig.type === "preview") {
					throw new Error("Unexpected preview config in dev.");
				}
				inspectorPort = await getInspectorPort();
				const entryWorkerConfig =
					workerEnvironments.get(ENVIRONMENT_NAME)?.config;
				const { headers } = api.getNormalizedConfig().server;
				const assetWorkers = await getDevAssetWorkerOptions({
					baseUrl: import.meta.url,
					entryWorkerConfig,
					hasUserWorker: resolvedPluginConfig.type === "workers",
					assetsConfig: getAssetsConfig(
						resolvedPluginConfig,
						entryWorkerConfig,
						{
							publicDir:
								getPublicDirs(
									api.getNormalizedConfig().server.publicDir,
									root
								)[0] ?? path.join(root, "public"),
							logger: api.logger,
						}
					),
					headers,
					html: htmlHandlers,
				});
				const localBindings = resolveLocalBindingsByWorkerName(
					[...workerEnvironments.values()].map(({ config }) => config),
					resolvedPluginConfig.localEnv,
					resolvedPluginConfig.devVars
				);
				warnForMissingSecrets(localBindings, mode, api.logger);

				const workers = await Promise.all(
					[...workerEnvironments].map(async ([name, { config }]) => {
						const workerOptions = await getDevUserWorkerOptions(config, {
							resolvedLocalBindings: localBindings.get(config.name),
							remoteProxy: {
								...resolvedPluginConfig,
								root,
								logger: api.logger,
							},
							// Rsbuild serves the client assets in dev.
							handleAssetRequest: (req, res) =>
								devServer?.middlewares(req, res),
							inspectorPort,
							// Containers aren't supported yet, so Container-backed exports throw.
							containerRuntimeOptions: undefined,
						});
						return {
							...workerOptions,
							config: {
								...workerOptions.config,
								manifest: manifests.get(name),
							},
						} satisfies WorkerOptions;
					})
				);

				return {
					...getCommonMiniflareOptions({
						root,
						persistState: resolvedPluginConfig.persistState,
						logger: miniflareLogger,
						inspectorPort,
						publicUrl: undefined,
					}),
					// As in the Vite plugin, don't log every request.
					logRequests: false,
					workers: [...assetWorkers, ...workers],
				};
			}
		},
	};
}

/** Resolves Rsbuild's `server.publicDir` option to absolute directories. */
function getPublicDirs(
	publicDir: PublicDir | undefined,
	root: string
): string[] {
	if (publicDir === false) {
		return [];
	}
	return [publicDir ?? {}]
		.flat()
		.map(({ name = "public" }) => path.resolve(root, name));
}

/**
 * Whether a request is for a page, which Rsbuild would otherwise serve itself:
 * a `GET` or `HEAD` for an HTML file or an extension-less path, other than
 * Rsbuild's own routes.
 */
function isPageRequest(req: IncomingMessage, hmrPath: string): boolean {
	const { pathname } = new URL(req.url ?? "/", "http://localhost");
	return (
		(req.method === "GET" || req.method === "HEAD") &&
		pathname !== hmrPath &&
		!/^\/(__|rsbuild-)/.test(pathname) &&
		(pathname.endsWith(".html") || path.posix.extname(pathname) === "")
	);
}

/** The entry Worker builds in `cloudflare`, and every other Worker in `cloudflare_<directory>`. */
function getEnvironmentName({ directoryName }: Worker): string {
	return directoryName === DEFAULT_WORKER_DIRECTORY_NAME
		? ENVIRONMENT_NAME
		: `${ENVIRONMENT_NAME}_${directoryName}`;
}
