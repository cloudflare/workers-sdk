import assert from "node:assert";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	getDefaultDevRegistryPath,
	kCurrentWorker,
	kUnsafeEphemeralUniqueKey,
	Log,
	LogLevel,
	Response as MiniflareResponse,
} from "miniflare";
import colors from "picocolors";
import { globSync } from "tinyglobby";
import * as vite from "vite";
import {
	experimental_maybeStartOrUpdateRemoteProxySession,
	unstable_convertConfigBindingsToStartWorkerBindings,
	unstable_getMiniflareWorkerOptions,
} from "wrangler";
import { getAssetsConfig } from "./asset-config";
import {
	ASSET_WORKER_NAME,
	ASSET_WORKERS_COMPATIBILITY_DATE,
	kRequestType,
	PUBLIC_DIR_PREFIX,
	ROUTER_WORKER_NAME,
	VITE_PROXY_WORKER_NAME,
} from "./constants";
import { additionalModuleRE } from "./shared";
import { withTrailingSlash } from "./utils";
import type { CloudflareDevEnvironment } from "./cloudflare-environment";
import type {
	AssetsOnlyResolvedConfig,
	PersistState,
	PreviewResolvedConfig,
	WorkerConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type { MiniflareOptions, WorkerOptions } from "miniflare";
import type { FetchFunctionOptions } from "vite/module-runner";
import type {
	Experimental_RemoteProxySession,
	SourcelessWorkerOptions,
	Unstable_Binding,
} from "wrangler";

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

function missingWorkerErrorMessage(workerName: string) {
	return `${workerName} does not match a worker name.`;
}

function getWorkerToWorkerEntrypointNamesMap(
	workers: Array<Pick<WorkerOptions, "serviceBindings"> & { name: string }>
) {
	const workerToWorkerEntrypointNamesMap = new Map(
		workers.map((workerOptions) => [workerOptions.name, new Set<string>()])
	);

	for (const worker of workers) {
		for (const value of Object.values(worker.serviceBindings ?? {})) {
			if (
				typeof value === "object" &&
				"name" in value &&
				value.entrypoint !== undefined &&
				value.entrypoint !== "default"
			) {
				const targetWorkerName =
					value.name === kCurrentWorker ? worker.name : value.name;
				const entrypointNames =
					workerToWorkerEntrypointNamesMap.get(targetWorkerName);

				if (entrypointNames) {
					entrypointNames.add(value.entrypoint);
				}
			}
		}
	}

	return workerToWorkerEntrypointNamesMap;
}

function getWorkerToDurableObjectClassNamesMap(
	workers: Array<Pick<WorkerOptions, "durableObjects"> & { name: string }>
) {
	const workerToDurableObjectClassNamesMap = new Map(
		workers.map((workerOptions) => [workerOptions.name, new Set<string>()])
	);

	for (const worker of workers) {
		for (const value of Object.values(worker.durableObjects ?? {})) {
			if (typeof value === "string") {
				const classNames = workerToDurableObjectClassNamesMap.get(worker.name);
				assert(classNames, missingWorkerErrorMessage(worker.name));

				classNames.add(value);
			} else if (typeof value === "object") {
				if (value.scriptName) {
					const classNames = workerToDurableObjectClassNamesMap.get(
						value.scriptName
					);
					assert(classNames, missingWorkerErrorMessage(value.scriptName));

					classNames.add(value.className);
				} else {
					const classNames = workerToDurableObjectClassNamesMap.get(
						worker.name
					);
					assert(classNames, missingWorkerErrorMessage(worker.name));

					classNames.add(value.className);
				}
			}
		}
	}

	return workerToDurableObjectClassNamesMap;
}

function getWorkerToWorkflowEntrypointClassNamesMap(
	workers: Array<Pick<WorkerOptions, "workflows"> & { name: string }>
) {
	const workerToWorkflowEntrypointClassNamesMap = new Map(
		workers.map((workerOptions) => [workerOptions.name, new Set<string>()])
	);

	for (const worker of workers) {
		for (const value of Object.values(worker.workflows ?? {})) {
			if (value.scriptName) {
				const classNames = workerToWorkflowEntrypointClassNamesMap.get(
					value.scriptName
				);
				assert(classNames, missingWorkerErrorMessage(value.scriptName));

				classNames.add(value.className);
			} else {
				const classNames = workerToWorkflowEntrypointClassNamesMap.get(
					worker.name
				);
				assert(classNames, missingWorkerErrorMessage(worker.name));

				classNames.add(value.className);
			}
		}
	}

	return workerToWorkflowEntrypointClassNamesMap;
}

// We want module names to be their absolute path without the leading slash
// (i.e. the modules root should be the root directory). On Windows, we need
// paths to include the drive letter (i.e. `C:/a/b/c/index.mjs`).
// Internally, Miniflare uses `path.relative(modulesRoot, path)` to compute
// module names. Setting `modulesRoot` to a drive letter and prepending this
// to paths ensures correct names. This requires us to specify `contents` in
// the miniflare module definitions though, as the new paths don't exist.
const miniflareModulesRoot = process.platform === "win32" ? "Z:\\" : "/";
const ROUTER_WORKER_PATH = "./asset-workers/router-worker.js";
const ASSET_WORKER_PATH = "./asset-workers/asset-worker.js";
const WRAPPER_PATH = "__VITE_WORKER_ENTRY__";
const RUNNER_PATH = "./runner-worker/index.js";
const VITE_PROXY_WORKER_PATH = "./vite-proxy-worker/index.js";

export function getEntryWorkerConfig(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig
): WorkerConfig | undefined {
	if (resolvedPluginConfig.type === "assets-only") {
		return;
	}

	return resolvedPluginConfig.workers[
		resolvedPluginConfig.entryWorkerEnvironmentName
	];
}

function logUnknownTails(
	tails: WorkerOptions["tails"],
	userWorkers: { name?: string }[],
	log: (msg: string) => void
) {
	// Only connect the tail consumers that represent Workers that are defined in the Vite config. Warn that a tail might be omitted otherwise
	// This _differs from service bindings_ because tail consumers are "optional" in a sense, and shouldn't affect the runtime behaviour of a Worker
	for (const tailService of tails ?? []) {
		let name: string;
		if (typeof tailService === "string") {
			name = tailService;
		} else if (
			typeof tailService === "object" &&
			"name" in tailService &&
			typeof tailService.name === "string"
		) {
			name = tailService.name;
		} else {
			// Don't interfere with network-based tail connections (e.g. via the dev registry), or kCurrentWorker
			continue;
		}
		const found = userWorkers.some((w) => w.name === name);

		if (!found) {
			log(
				colors.dim(
					colors.yellow(
						`Tail consumer "${name}" was not found in your config. Make sure you add it to the config or run it in another dev session if you'd like to simulate receiving tail events locally.`
					)
				)
			);
		}
	}
}

/** Map that maps worker configPaths to their existing remote proxy session data (if any) */
const remoteProxySessionsDataMap = new Map<
	string,
	{
		session: Experimental_RemoteProxySession;
		remoteBindings: Record<string, Unstable_Binding>;
	} | null
>();

export async function getDevMiniflareOptions(config: {
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig;
	viteDevServer: vite.ViteDevServer;
	inspectorPort: number | false;
	containerBuildId?: string;
}): Promise<MiniflareOptions> {
	const {
		resolvedPluginConfig,
		viteDevServer,
		inspectorPort,
		containerBuildId,
	} = config;
	const resolvedViteConfig = viteDevServer.config;
	const entryWorkerConfig = getEntryWorkerConfig(resolvedPluginConfig);

	const assetsConfig = getAssetsConfig(
		resolvedPluginConfig,
		entryWorkerConfig,
		resolvedViteConfig
	);

	const assetWorkers: Array<WorkerOptions> = [
		{
			name: ROUTER_WORKER_NAME,
			compatibilityDate: ASSET_WORKERS_COMPATIBILITY_DATE,
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
			compatibilityDate: ASSET_WORKERS_COMPATIBILITY_DATE,
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
							} catch (error) {}
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
					} catch (error) {
						throw new Error(`Unexpected error. Failed to load "${pathname}".`);
					}
				},
			},
		},
		{
			name: VITE_PROXY_WORKER_NAME,
			compatibilityDate: ASSET_WORKERS_COMPATIBILITY_DATE,
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

	const workersFromConfig =
		resolvedPluginConfig.type === "workers"
			? await Promise.all(
					Object.entries(resolvedPluginConfig.workers).map(
						async ([environmentName, workerConfig]) => {
							const bindings =
								unstable_convertConfigBindingsToStartWorkerBindings(
									workerConfig
								);

							const preExistingRemoteProxySession = workerConfig.configPath
								? remoteProxySessionsDataMap.get(workerConfig.configPath)
								: undefined;

							const remoteProxySessionData = resolvedPluginConfig.experimental
								.remoteBindings
								? await experimental_maybeStartOrUpdateRemoteProxySession(
										{
											name: workerConfig.name,
											bindings: bindings ?? {},
										},
										preExistingRemoteProxySession ?? null
									)
								: undefined;

							if (workerConfig.configPath && remoteProxySessionData) {
								remoteProxySessionsDataMap.set(
									workerConfig.configPath,
									remoteProxySessionData
								);
							}

							const miniflareWorkerOptions = unstable_getMiniflareWorkerOptions(
								{
									...workerConfig,
									assets: undefined,
								},
								resolvedPluginConfig.cloudflareEnv,
								{
									remoteProxyConnectionString:
										remoteProxySessionData?.session
											?.remoteProxyConnectionString,
									remoteBindingsEnabled:
										resolvedPluginConfig.experimental.remoteBindings,
									containerBuildId,
								}
							);

							const { externalWorkers } = miniflareWorkerOptions;

							const workerOptions = miniflareWorkerOptions.workerOptions;

							return {
								externalWorkers,
								worker: {
									...workerOptions,
									name: workerOptions.name ?? workerConfig.name,
									unsafeInspectorProxy: inspectorPort !== false,
									unsafeDirectSockets:
										environmentName ===
										resolvedPluginConfig.entryWorkerEnvironmentName
											? [
													{
														// This exposes the default entrypoint of the asset proxy worker
														// on the dev registry with the name of the entry worker
														serviceName: VITE_PROXY_WORKER_NAME,
														entrypoint: undefined,
														proxy: true,
													},
												]
											: [],
									modulesRoot: miniflareModulesRoot,
									unsafeEvalBinding: "__VITE_UNSAFE_EVAL__",
									serviceBindings: {
										...workerOptions.serviceBindings,
										...(environmentName ===
											resolvedPluginConfig.entryWorkerEnvironmentName &&
										workerConfig.assets?.binding
											? {
													[workerConfig.assets.binding]: {
														node: (req, res) => {
															req[kRequestType] = "asset";
															viteDevServer.middlewares(req, res);
														},
													},
												}
											: {}),
										__VITE_INVOKE_MODULE__: async (request) => {
											const payload =
												(await request.json()) as vite.CustomPayload;
											const invokePayloadData = payload.data as {
												id: string;
												name: string;
												data: [string, string, FetchFunctionOptions];
											};

											assert(
												invokePayloadData.name === "fetchModule",
												`Invalid invoke event: ${invokePayloadData.name}`
											);

											const [moduleId] = invokePayloadData.data;

											// Additional modules (CompiledWasm, Data, Text)
											if (additionalModuleRE.test(moduleId)) {
												const result = {
													externalize: moduleId,
													type: "module",
												} satisfies vite.FetchResult;

												return MiniflareResponse.json({ result });
											}

											const devEnvironment = viteDevServer.environments[
												environmentName
											] as CloudflareDevEnvironment;

											const result =
												await devEnvironment.hot.handleInvoke(payload);

											return MiniflareResponse.json(result);
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

	const workerToWorkerEntrypointNamesMap =
		getWorkerToWorkerEntrypointNamesMap(userWorkers);
	const workerToDurableObjectClassNamesMap =
		getWorkerToDurableObjectClassNamesMap(userWorkers);
	const workerToWorkflowEntrypointClassNamesMap =
		getWorkerToWorkflowEntrypointClassNamesMap(userWorkers);

	const logger = new ViteMiniflareLogger(resolvedViteConfig);

	return {
		log: logger,
		logRequests: false,
		inspectorPort: inspectorPort === false ? undefined : inspectorPort,
		unsafeInspectorProxy: inspectorPort !== false,
		unsafeDevRegistryPath: getDefaultDevRegistryPath(),
		unsafeTriggerHandlers: true,
		handleRuntimeStdio(stdout, stderr) {
			const decoder = new TextDecoder();
			stdout.forEach((data) => logger.info(decoder.decode(data)));
			stderr.forEach((error) =>
				logger.logWithLevel(LogLevel.ERROR, decoder.decode(error))
			);
		},
		defaultPersistRoot: getPersistenceRoot(
			resolvedViteConfig.root,
			resolvedPluginConfig.persistState
		),
		workers: [
			...assetWorkers,
			...externalWorkers,
			...userWorkers.map((workerOptions) => {
				const wrappers = [
					`import { createWorkerEntrypointWrapper, createDurableObjectWrapper, createWorkflowEntrypointWrapper } from '${RUNNER_PATH}';`,
					`export { __VITE_RUNNER_OBJECT__ } from '${RUNNER_PATH}';`,
					`export default createWorkerEntrypointWrapper('default');`,
				];

				const workerEntrypointNames = workerToWorkerEntrypointNamesMap.get(
					workerOptions.name
				);
				assert(
					workerEntrypointNames,
					`WorkerEntrypoint names not found for worker ${workerOptions.name}`
				);

				for (const entrypointName of [...workerEntrypointNames].sort()) {
					wrappers.push(
						`export const ${entrypointName} = createWorkerEntrypointWrapper('${entrypointName}');`
					);
				}

				const durableObjectClassNames = workerToDurableObjectClassNamesMap.get(
					workerOptions.name
				);
				assert(
					durableObjectClassNames,
					`DurableObject class names not found for worker ${workerOptions.name}`
				);

				for (const className of [...durableObjectClassNames].sort()) {
					wrappers.push(
						`export const ${className} = createDurableObjectWrapper('${className}');`
					);
				}

				const workflowEntrypointClassNames =
					workerToWorkflowEntrypointClassNamesMap.get(workerOptions.name);
				assert(
					workflowEntrypointClassNames,
					`WorkflowEntrypoint class names not found for worker: ${workerOptions.name}`
				);

				for (const className of [...workflowEntrypointClassNames].sort()) {
					wrappers.push(
						`export const ${className} = createWorkflowEntrypointWrapper('${className}');`
					);
				}

				logUnknownTails(
					workerOptions.tails,
					userWorkers,
					viteDevServer.config.logger.warn
				);

				return {
					...workerOptions,
					durableObjects: {
						...workerOptions.durableObjects,
						__VITE_RUNNER_OBJECT__: {
							className: "__VITE_RUNNER_OBJECT__",
							unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
							unsafePreventEviction: true,
						},
					},
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
				} satisfies WorkerOptions;
			}),
		],
		async unsafeModuleFallbackService(request) {
			const url = new URL(request.url);
			const rawSpecifier = url.searchParams.get("rawSpecifier");
			assert(
				rawSpecifier,
				`Unexpected error: no specifier in request to module fallback service.`
			);

			const match = additionalModuleRE.exec(rawSpecifier);
			assert(match, `Unexpected error: no match for module: ${rawSpecifier}.`);
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
			} catch (error) {
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
				globSync(include, { cwd: rootPath, ignore: entryPath }).map((path) => ({
					type,
					path,
				}))
			),
		],
	} satisfies Pick<WorkerOptions, "rootPath" | "modules">;
}

export async function getPreviewMiniflareOptions(config: {
	resolvedPluginConfig: PreviewResolvedConfig;
	vitePreviewServer: vite.PreviewServer;
	inspectorPort: number | false;
	containerBuildId?: string;
}): Promise<MiniflareOptions> {
	const {
		resolvedPluginConfig,
		vitePreviewServer,
		inspectorPort,
		containerBuildId,
	} = config;
	const resolvedViteConfig = vitePreviewServer.config;
	const workers: Array<WorkerOptions> = (
		await Promise.all(
			resolvedPluginConfig.workers.map(async (workerConfig, i) => {
				const bindings =
					unstable_convertConfigBindingsToStartWorkerBindings(workerConfig);

				const preExistingRemoteProxySessionData = workerConfig.configPath
					? remoteProxySessionsDataMap.get(workerConfig.configPath)
					: undefined;

				const remoteProxySessionData = resolvedPluginConfig.experimental
					.remoteBindings
					? await experimental_maybeStartOrUpdateRemoteProxySession(
							{
								name: workerConfig.name,
								bindings: bindings ?? {},
							},
							preExistingRemoteProxySessionData ?? null
						)
					: undefined;

				if (workerConfig.configPath && remoteProxySessionData) {
					remoteProxySessionsDataMap.set(
						workerConfig.configPath,
						remoteProxySessionData
					);
				}

				const miniflareWorkerOptions = unstable_getMiniflareWorkerOptions(
					workerConfig,
					undefined,
					{
						remoteProxyConnectionString:
							remoteProxySessionData?.session?.remoteProxyConnectionString,
						remoteBindingsEnabled:
							resolvedPluginConfig.experimental.remoteBindings,
						containerBuildId,
					}
				);

				const { externalWorkers } = miniflareWorkerOptions;

				const { modulesRules, ...workerOptions } =
					miniflareWorkerOptions.workerOptions;

				logUnknownTails(
					workerOptions.tails,
					resolvedPluginConfig.workers,
					vitePreviewServer.config.logger.warn
				);

				return [
					{
						...workerOptions,
						name: workerOptions.name ?? workerConfig.name,
						unsafeInspectorProxy: inspectorPort !== false,
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
		log: logger,
		inspectorPort: inspectorPort === false ? undefined : inspectorPort,
		unsafeInspectorProxy: inspectorPort !== false,
		unsafeDevRegistryPath: getDefaultDevRegistryPath(),
		unsafeTriggerHandlers: true,
		handleRuntimeStdio(stdout, stderr) {
			const decoder = new TextDecoder();
			stdout.forEach((data) => logger.info(decoder.decode(data)));
			stderr.forEach((error) =>
				logger.logWithLevel(LogLevel.ERROR, decoder.decode(error))
			);
		},
		defaultPersistRoot: getPersistenceRoot(
			resolvedViteConfig.root,
			resolvedPluginConfig.persistState
		),
		workers,
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
