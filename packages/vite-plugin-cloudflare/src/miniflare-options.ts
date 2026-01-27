import assert from "node:assert";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	generateContainerBuildId,
	resolveDockerHost,
} from "@cloudflare/containers-shared";
import { getLocalExplorerFromEnv } from "@cloudflare/workers-utils";
import {
	getDefaultDevRegistryPath,
	kUnsafeEphemeralUniqueKey,
	Log,
	LogLevel,
	Response as MiniflareResponse,
} from "miniflare";
import { globSync } from "tinyglobby";
import * as wrangler from "wrangler";
import { getAssetsConfig } from "./asset-config";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	ROUTER_WORKER_NAME,
	VITE_PROXY_WORKER_NAME,
} from "./constants";
import { getContainerOptions, getDockerPath } from "./containers";
import { getInputInspectorPort } from "./debug";
import { additionalModuleRE } from "./plugins/additional-modules";
import { ENVIRONMENT_NAME_HEADER } from "./shared";
import { withTrailingSlash } from "./utils";
import type { CloudflareDevEnvironment } from "./cloudflare-environment";
import type { ContainerTagToOptionsMap } from "./containers";
import type {
	AssetsOnlyPluginContext,
	PreviewPluginContext,
	WorkersPluginContext,
} from "./context";
import type { PersistState } from "./plugin-config";
import type {
	MiniflareOptions,
	WorkerdStructuredLog,
	WorkerOptions,
} from "miniflare";
import type * as vite from "vite";
import type {
	Binding,
	RemoteProxySession,
	SourcelessWorkerOptions,
} from "wrangler";

const INTERNAL_WORKERS_COMPATIBILITY_DATE = "2024-10-04";
// Used to mark HTML assets as being in the public directory so that they can be resolved from their root relative paths
const PUBLIC_DIR_PREFIX = "/__vite_public_dir__";

function getPersistenceRoot(
	root: string,
	persistState: PersistState
): string | undefined {
	if (persistState === false) {
		return;
	}

	const defaultPersistPath = ".wrangler/state";
	const persistPath = path.resolve(
		root,
		typeof persistState === "object" ? persistState.path : defaultPersistPath,
		"v3"
	);

	return persistPath;
}

// We want module names to be their absolute path without the leading slash
// (i.e. the modules root should be the root directory). On Windows, we need
// paths to include the drive letter (i.e. `C:/a/b/c/index.mjs`).
// Internally, Miniflare uses `path.relative(modulesRoot, path)` to compute
// module names. Setting `modulesRoot` to a drive letter and prepending this
// to paths ensures correct names. This requires us to specify `contents` in
// the miniflare module definitions though, as the new paths don't exist.
const miniflareModulesRoot = process.platform === "win32" ? "Z:\\" : "/";
const ROUTER_WORKER_PATH = "./workers/router-worker.js";
const ASSET_WORKER_PATH = "./workers/asset-worker.js";
const VITE_PROXY_WORKER_PATH = "./workers/vite-proxy-worker.js";
const RUNNER_PATH = "./workers/runner-worker.js";
const WRAPPER_PATH = "__VITE_WORKER_ENTRY__";

/** Map that maps worker configPaths to their existing remote proxy session data (if any) */
const remoteProxySessionsDataMap = new Map<
	string,
	{
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
	} | null
>();

export async function getDevMiniflareOptions(
	ctx: AssetsOnlyPluginContext | WorkersPluginContext,
	viteDevServer: vite.ViteDevServer
): Promise<{
	miniflareOptions: Extract<MiniflareOptions, { workers: WorkerOptions[] }>;
	containerTagToOptionsMap: ContainerTagToOptionsMap;
}> {
	const inputInspectorPort = await getInputInspectorPort(ctx, viteDevServer);
	const { resolvedPluginConfig, resolvedViteConfig, entryWorkerConfig } = ctx;

	const assetsConfig = getAssetsConfig(
		resolvedPluginConfig,
		entryWorkerConfig,
		resolvedViteConfig
	);

	const assetWorkers: Array<WorkerOptions> = [
		{
			name: ROUTER_WORKER_NAME,
			compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
			modulesRoot: miniflareModulesRoot,
			modules: [
				{
					type: "ESModule",
					path: path.join(miniflareModulesRoot, ROUTER_WORKER_PATH),
					contents: fs.readFileSync(
						fileURLToPath(new URL(ROUTER_WORKER_PATH, import.meta.url))
					),
				},
			],
			bindings: {
				CONFIG: {
					has_user_worker: resolvedPluginConfig.type === "workers",
				},
			},
			serviceBindings: {
				ASSET_WORKER: ASSET_WORKER_NAME,
				...(entryWorkerConfig ? { USER_WORKER: entryWorkerConfig.name } : {}),
			},
		},
		{
			name: ASSET_WORKER_NAME,
			compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
			modulesRoot: miniflareModulesRoot,
			modules: [
				{
					type: "ESModule",
					path: path.join(miniflareModulesRoot, ASSET_WORKER_PATH),
					contents: fs.readFileSync(
						fileURLToPath(new URL(ASSET_WORKER_PATH, import.meta.url))
					),
				},
			],
			bindings: {
				CONFIG: assetsConfig,
				__VITE_HEADERS__: JSON.stringify(viteDevServer.config.server.headers),
			},
			serviceBindings: {
				__VITE_HTML_EXISTS__: async (request) => {
					const { pathname } = new URL(request.url);

					if (pathname.endsWith(".html")) {
						const { root, publicDir } = resolvedViteConfig;
						const publicDirInRoot = publicDir.startsWith(
							withTrailingSlash(root)
						);
						const publicPath = withTrailingSlash(publicDir.slice(root.length));

						// Assets in the public directory should be served at the root path
						if (publicDirInRoot && pathname.startsWith(publicPath)) {
							return MiniflareResponse.json(null);
						}

						const publicDirFilePath = path.join(publicDir, pathname);
						const rootDirFilePath = path.join(root, pathname);

						for (const resolvedPath of [publicDirFilePath, rootDirFilePath]) {
							try {
								const stats = await fsp.stat(resolvedPath);

								if (stats.isFile()) {
									return MiniflareResponse.json(
										resolvedPath === publicDirFilePath
											? `${PUBLIC_DIR_PREFIX}${pathname}`
											: pathname
									);
								}
							} catch {}
						}
					}

					return MiniflareResponse.json(null);
				},
				__VITE_FETCH_HTML__: async (request) => {
					const { pathname } = new URL(request.url);
					const { root, publicDir } = resolvedViteConfig;
					const isInPublicDir = pathname.startsWith(PUBLIC_DIR_PREFIX);
					const resolvedPath = isInPublicDir
						? path.join(publicDir, pathname.slice(PUBLIC_DIR_PREFIX.length))
						: path.join(root, pathname);

					try {
						let html = await fsp.readFile(resolvedPath, "utf-8");

						// HTML files in the public directory should not be transformed
						if (!isInPublicDir) {
							html = await viteDevServer.transformIndexHtml(resolvedPath, html);
						}

						return new MiniflareResponse(html, {
							headers: { "Content-Type": "text/html" },
						});
					} catch {
						throw new Error(`Unexpected error. Failed to load "${pathname}".`);
					}
				},
			},
		},
		{
			name: VITE_PROXY_WORKER_NAME,
			compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
			modulesRoot: miniflareModulesRoot,
			modules: [
				{
					type: "ESModule",
					path: path.join(miniflareModulesRoot, VITE_PROXY_WORKER_PATH),
					contents: fs.readFileSync(
						fileURLToPath(new URL(VITE_PROXY_WORKER_PATH, import.meta.url))
					),
				},
			],
			serviceBindings: {
				...(entryWorkerConfig
					? { ENTRY_USER_WORKER: entryWorkerConfig.name }
					: {}),
				__VITE_MIDDLEWARE__: {
					node: (req, res) => viteDevServer.middlewares(req, res),
				},
			},
		},
	];

	const containerTagToOptionsMap: ContainerTagToOptionsMap = new Map();

	const workersFromConfig =
		resolvedPluginConfig.type === "workers"
			? await Promise.all(
					[...resolvedPluginConfig.environmentNameToWorkerMap].map(
						async ([environmentName, worker]) => {
							const bindings =
								wrangler.unstable_convertConfigBindingsToStartWorkerBindings(
									worker.config
								);

							const preExistingRemoteProxySession = worker.config.configPath
								? remoteProxySessionsDataMap.get(worker.config.configPath)
								: undefined;

							const remoteProxySessionData =
								!resolvedPluginConfig.remoteBindings
									? // if remote bindings are not enabled then the proxy session can simply be null
										null
									: await wrangler.maybeStartOrUpdateRemoteProxySession(
											{
												name: worker.config.name,
												bindings: bindings ?? {},
												account_id: worker.config.account_id,
											},
											preExistingRemoteProxySession ?? null
										);

							if (worker.config.configPath && remoteProxySessionData) {
								remoteProxySessionsDataMap.set(
									worker.config.configPath,
									remoteProxySessionData
								);
							}

							let containerBuildId: string | undefined;
							if (
								worker.config.containers?.length &&
								worker.config.dev.enable_containers
							) {
								const dockerPath = getDockerPath();
								worker.config.dev.container_engine =
									resolveDockerHost(dockerPath);
								containerBuildId = generateContainerBuildId();

								const options = getContainerOptions({
									containersConfig: worker.config.containers,
									containerBuildId,
									configPath: worker.config.configPath,
								});
								for (const option of options ?? []) {
									containerTagToOptionsMap.set(option.image_tag, option);
								}
							}

							const miniflareWorkerOptions =
								wrangler.unstable_getMiniflareWorkerOptions(
									{
										...worker.config,
										assets: undefined,
									},
									resolvedPluginConfig.cloudflareEnv,
									{
										remoteProxyConnectionString:
											remoteProxySessionData?.session
												?.remoteProxyConnectionString,

										containerBuildId,
									}
								);

							const { externalWorkers, workerOptions } = miniflareWorkerOptions;

							const wrappers = [
								`import { createWorkerEntrypointWrapper, createDurableObjectWrapper, createWorkflowEntrypointWrapper } from "${RUNNER_PATH}";`,
								`export { __VITE_RUNNER_OBJECT__ } from "${RUNNER_PATH}";`,
								`export default createWorkerEntrypointWrapper("default");`,
							];

							const exportTypes = ctx.workerNameToExportTypesMap.get(
								worker.config.name
							);
							assert(exportTypes, `Expected exportTypes to be defined`);

							for (const [name, type] of Object.entries(exportTypes)) {
								wrappers.push(
									`export const ${name} = create${type}Wrapper("${name}");`
								);
							}

							return {
								externalWorkers,
								worker: {
									...workerOptions,
									name: worker.config.name,
									modulesRoot: miniflareModulesRoot,
									modules: [
										{
											type: "ESModule",
											path: path.join(miniflareModulesRoot, WRAPPER_PATH),
											contents: wrappers.join("\n"),
										},
										{
											type: "ESModule",
											path: path.join(miniflareModulesRoot, RUNNER_PATH),
											contents: fs.readFileSync(
												fileURLToPath(new URL(RUNNER_PATH, import.meta.url))
											),
										},
									],
									unsafeUseModuleFallbackService: true,
									unsafeInspectorProxy: inputInspectorPort !== false,
									unsafeDirectSockets:
										environmentName ===
										resolvedPluginConfig.entryWorkerEnvironmentName
											? [
													{
														// This exposes the default entrypoint of the asset proxy worker
														// on the dev registry with the name of the entry worker
														serviceName: VITE_PROXY_WORKER_NAME,
														proxy: true,
													},
													...Object.entries(exportTypes)
														.filter(([_, type]) => type === "WorkerEntrypoint")
														.map(([entrypoint]) => ({
															entrypoint,
															proxy: true,
														})),
												]
											: [],
									unsafeEvalBinding: "__VITE_UNSAFE_EVAL__",
									serviceBindings: {
										...workerOptions.serviceBindings,
										...(environmentName ===
											resolvedPluginConfig.entryWorkerEnvironmentName &&
										worker.config.assets?.binding
											? {
													[worker.config.assets.binding]: {
														node: (req, res) => {
															req[kRequestType] = "asset";
															viteDevServer.middlewares(req, res);
														},
													},
												}
											: {}),
										__VITE_INVOKE_MODULE__: async (request) => {
											const targetEnvironmentName = request.headers.get(
												ENVIRONMENT_NAME_HEADER
											);
											assert(
												targetEnvironmentName,
												`Expected ${ENVIRONMENT_NAME_HEADER} header`
											);
											const payload =
												(await request.json()) as vite.CustomPayload;
											const devEnvironment = viteDevServer.environments[
												targetEnvironmentName
											] as CloudflareDevEnvironment;
											const result =
												await devEnvironment.hot.handleInvoke(payload);
											return MiniflareResponse.json(result);
										},
									},
									durableObjects: {
										...workerOptions.durableObjects,
										__VITE_RUNNER_OBJECT__: {
											className: "__VITE_RUNNER_OBJECT__",
											unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
											unsafePreventEviction: true,
										},
									},
								} satisfies Partial<WorkerOptions>,
							};
						}
					)
				)
			: [];

	const userWorkers = workersFromConfig.map((options) => options.worker);

	const externalWorkers = workersFromConfig.flatMap(
		(options) => options.externalWorkers
	);

	const logger = new ViteMiniflareLogger(resolvedViteConfig);

	return {
		miniflareOptions: {
			log: logger,
			logRequests: false,
			inspectorPort:
				inputInspectorPort === false ? undefined : inputInspectorPort,
			unsafeDevRegistryPath: getDefaultDevRegistryPath(),
			unsafeTriggerHandlers: true,
			unsafeLocalExplorer: getLocalExplorerFromEnv(),
			handleStructuredLogs: getStructuredLogsLogger(logger),
			defaultPersistRoot: getPersistenceRoot(
				resolvedViteConfig.root,
				resolvedPluginConfig.persistState
			),
			workers: [...assetWorkers, ...externalWorkers, ...userWorkers],
			async unsafeModuleFallbackService(request) {
				const url = new URL(request.url);
				const rawSpecifier = url.searchParams.get("rawSpecifier");
				assert(
					rawSpecifier,
					`Unexpected error: no specifier in request to module fallback service.`
				);

				const match = additionalModuleRE.exec(rawSpecifier);
				assert(
					match,
					`Unexpected error: no match for module: ${rawSpecifier}.`
				);
				const [full, moduleType, modulePath] = match;
				assert(
					moduleType,
					`Unexpected error: module type not found in reference: ${full}.`
				);
				assert(
					modulePath,
					`Unexpected error: module path not found in reference: ${full}.`
				);

				let contents: Buffer;

				try {
					contents = await fsp.readFile(modulePath);
				} catch {
					throw new Error(
						`Import "${modulePath}" not found. Does the file exist?`
					);
				}

				switch (moduleType) {
					case "CompiledWasm": {
						return MiniflareResponse.json({ wasm: Array.from(contents) });
					}
					case "Data": {
						return MiniflareResponse.json({ data: Array.from(contents) });
					}
					case "Text": {
						return MiniflareResponse.json({ text: contents.toString() });
					}
					default: {
						return MiniflareResponse.error();
					}
				}
			},
		},
		containerTagToOptionsMap,
	};
}

function getPreviewModules(
	main: string,
	modulesRules: SourcelessWorkerOptions["modulesRules"]
) {
	assert(modulesRules, `Unexpected error: 'modulesRules' is undefined`);
	const rootPath = path.dirname(main);
	const entryPath = path.basename(main);

	return {
		rootPath,
		modules: [
			{
				type: "ESModule",
				path: entryPath,
			} as const,
			...modulesRules.flatMap(({ type, include }) =>
				globSync(include, { cwd: rootPath, ignore: entryPath }).map(
					(globPath) => ({
						type,
						path: globPath,
					})
				)
			),
		],
	} satisfies Pick<WorkerOptions, "rootPath" | "modules">;
}

export async function getPreviewMiniflareOptions(
	ctx: PreviewPluginContext,
	vitePreviewServer: vite.PreviewServer
): Promise<{
	miniflareOptions: Extract<MiniflareOptions, { workers: WorkerOptions[] }>;
	containerTagToOptionsMap: ContainerTagToOptionsMap;
}> {
	const inputInspectorPort = await getInputInspectorPort(
		ctx,
		vitePreviewServer
	);
	const { resolvedPluginConfig, resolvedViteConfig } = ctx;
	const containerTagToOptionsMap: ContainerTagToOptionsMap = new Map();

	const workers: Array<WorkerOptions> = (
		await Promise.all(
			resolvedPluginConfig.workers.map(async (workerConfig, i) => {
				const bindings =
					wrangler.unstable_convertConfigBindingsToStartWorkerBindings(
						workerConfig
					);

				const preExistingRemoteProxySessionData = workerConfig.configPath
					? remoteProxySessionsDataMap.get(workerConfig.configPath)
					: undefined;

				const remoteProxySessionData = !resolvedPluginConfig.remoteBindings
					? // if remote bindings are not enabled then the proxy session can simply be null
						null
					: await wrangler.maybeStartOrUpdateRemoteProxySession(
							{
								name: workerConfig.name,
								bindings: bindings ?? {},
								account_id: workerConfig.account_id,
							},
							preExistingRemoteProxySessionData ?? null
						);

				if (workerConfig.configPath && remoteProxySessionData) {
					remoteProxySessionsDataMap.set(
						workerConfig.configPath,
						remoteProxySessionData
					);
				}

				let containerBuildId: string | undefined;
				if (
					workerConfig.containers?.length &&
					workerConfig.dev.enable_containers
				) {
					const dockerPath = getDockerPath();
					workerConfig.dev.container_engine = resolveDockerHost(dockerPath);
					containerBuildId = generateContainerBuildId();

					const options = getContainerOptions({
						containersConfig: workerConfig.containers,
						containerBuildId,
						configPath: workerConfig.configPath,
					});
					for (const option of options ?? []) {
						containerTagToOptionsMap.set(option.image_tag, option);
					}
				}

				const miniflareWorkerOptions =
					wrangler.unstable_getMiniflareWorkerOptions(workerConfig, undefined, {
						remoteProxyConnectionString:
							remoteProxySessionData?.session?.remoteProxyConnectionString,

						containerBuildId,
					});

				const { externalWorkers } = miniflareWorkerOptions;

				const { modulesRules, ...workerOptions } =
					miniflareWorkerOptions.workerOptions;

				return [
					{
						...workerOptions,
						name: workerOptions.name ?? workerConfig.name,
						unsafeInspectorProxy: inputInspectorPort !== false,
						unsafeDirectSockets:
							// This exposes the default entrypoint of the entry worker on the dev registry
							// Assuming that the first worker config to be the entry worker.
							i === 0 ? [{ entrypoint: undefined, proxy: true }] : [],
						...(miniflareWorkerOptions.main
							? getPreviewModules(miniflareWorkerOptions.main, modulesRules)
							: { modules: true, script: "" }),
					},
					...externalWorkers,
				] satisfies Array<WorkerOptions>;
			})
		)
	).flat();

	const logger = new ViteMiniflareLogger(resolvedViteConfig);

	return {
		miniflareOptions: {
			log: logger,
			inspectorPort:
				inputInspectorPort === false ? undefined : inputInspectorPort,
			unsafeDevRegistryPath: getDefaultDevRegistryPath(),
			unsafeTriggerHandlers: true,
			unsafeLocalExplorer: getLocalExplorerFromEnv(),
			handleStructuredLogs: getStructuredLogsLogger(logger),
			defaultPersistRoot: getPersistenceRoot(
				resolvedViteConfig.root,
				resolvedPluginConfig.persistState
			),
			workers,
		},
		containerTagToOptionsMap,
	};
}

/**
 * A Miniflare logger that forwards messages onto a Vite logger.
 */
class ViteMiniflareLogger extends Log {
	private logger: vite.Logger;
	constructor(config: vite.ResolvedConfig) {
		super(miniflareLogLevelFromViteLogLevel(config.logLevel));
		this.logger = config.logger;
	}

	override logWithLevel(level: LogLevel, message: string) {
		switch (level) {
			case LogLevel.ERROR:
				return this.logger.error(message);
			case LogLevel.WARN:
				return this.logger.warn(message);
			case LogLevel.INFO:
				return this.logger.info(message);
		}
	}

	override logReady() {
		// Noop so that Miniflare server start messages are not logged
	}
}

function miniflareLogLevelFromViteLogLevel(
	level: vite.LogLevel = "info"
): LogLevel {
	switch (level) {
		case "error":
			return LogLevel.ERROR;
		case "warn":
			return LogLevel.WARN;
		case "info":
			return LogLevel.INFO;
		case "silent":
			return LogLevel.NONE;
	}
}

/**
 * Generates a log handler to be passed as the `handleStructuredLogs` option to miniflare
 *
 * @param logger the vite logger to use
 * @returns the log handler to pass to miniflare
 */
function getStructuredLogsLogger(logger: Log) {
	return ({ level, message }: WorkerdStructuredLog) => {
		if (level === "warn") {
			return logger.warn(message);
		}

		if (level === "error") {
			return logger.logWithLevel(LogLevel.ERROR, message);
		}

		return logger.info(message);
	};
}
