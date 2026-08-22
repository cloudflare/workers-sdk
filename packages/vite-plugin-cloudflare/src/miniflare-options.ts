import assert from "node:assert";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as timers from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { format } from "node:util";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import {
	getBrowserRenderingHeadfulFromEnv,
	getLocalExplorerEnabledFromEnv,
	getLocalObservabilityEnabledFromEnv,
} from "@cloudflare/workers-utils";
import {
	buildPublicUrl,
	getDefaultDevRegistryPath,
	kUnsafeEphemeralUniqueKey,
	Log,
	LogLevel,
	parseModuleFallbackRequest,
	Response as MiniflareResponse,
} from "miniflare";
import { getAssetsConfig } from "./asset-config";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	PROXY_SHARED_SECRET,
	ROUTER_WORKER_NAME,
	VITE_PROXY_WORKER_NAME,
} from "./constants";
import { getInputInspectorPort } from "./debug";
import { additionalModuleRE } from "./plugins/additional-modules";
import { getRemoteBindings } from "./remote-bindings";
import { ENVIRONMENT_NAME_HEADER } from "./shared";
import { checkForNpmUpdate } from "./update-check";
import {
	debuglog,
	satisfiesMinimumViteVersion,
	withTrailingSlash,
} from "./utils";
import type { Bundle } from "./build-output-preview";
import type { CloudflareDevEnvironment } from "./cloudflare-environment";
import type {
	AssetsOnlyPluginContext,
	PreviewPluginContext,
	WorkersPluginContext,
} from "./context";
import type { PersistState } from "./plugin-config";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type {
	MiniflareOptions,
	WorkerdStructuredLog,
	WorkerOptions,
} from "miniflare";
import type * as vite from "vite";

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

	const defaultPersistPath = ".cloudflare/state";
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
const ROUTER_WORKER_PATH = "./workers/router-worker/index.js";
const ASSET_WORKER_PATH = "./workers/asset-worker/index.js";
const VITE_PROXY_WORKER_PATH = "./workers/vite-proxy-worker/index.js";
const RUNNER_PATH = "./workers/runner-worker/index.js";
const MODULE_RUNNER_PATH = "./workers/runner-worker/module-runner.js";
const MODULE_RUNNER_LEGACY_PATH =
	"./workers/runner-worker/module-runner-legacy.js";
const WRAPPER_PATH = "__VITE_WORKER_ENTRY__";
const ASSETS_ONLY_MODULE = "__VITE_ASSETS_ONLY__.js";
type MiniflareEnv = NonNullable<WorkerOptions["config"]["env"]>;
type MiniflareExports = NonNullable<WorkerOptions["config"]["exports"]>;

async function getInternalWorkerManifest(
	workerPath: string
): Promise<NonNullable<WorkerOptions["config"]["manifest"]>> {
	return {
		mainModule: workerPath,
		modulesRoot: miniflareModulesRoot,
		modules: {
			[workerPath]: {
				type: "esm",
				contents: await fsp.readFile(
					fileURLToPath(new URL(workerPath, import.meta.url)),
					"utf8"
				),
			},
		},
	};
}

async function getUserWorkerManifest(
	wrapperContents: string
): Promise<NonNullable<WorkerOptions["config"]["manifest"]>> {
	const moduleRunner = "workers/runner-worker/vite/module-runner";
	const moduleRunnerSource = satisfiesMinimumViteVersion("7.2.0")
		? MODULE_RUNNER_PATH
		: MODULE_RUNNER_LEGACY_PATH;
	const [runnerContents, moduleRunnerContents] = await Promise.all([
		fsp.readFile(fileURLToPath(new URL(RUNNER_PATH, import.meta.url)), "utf8"),
		fsp.readFile(
			fileURLToPath(new URL(moduleRunnerSource, import.meta.url)),
			"utf8"
		),
	]);

	return {
		mainModule: WRAPPER_PATH,
		modulesRoot: miniflareModulesRoot,
		modules: {
			[WRAPPER_PATH]: { type: "esm", contents: wrapperContents },
			[RUNNER_PATH]: {
				type: "esm",
				contents: runnerContents,
			},
			[moduleRunner]: {
				type: "esm",
				contents: moduleRunnerContents,
			},
		},
	};
}

function getAssetsOnlyManifest(
	rootPath: string
): NonNullable<WorkerOptions["config"]["manifest"]> {
	return {
		mainModule: ASSETS_ONLY_MODULE,
		modulesRoot: rootPath,
		modules: {
			[ASSETS_ONLY_MODULE]: {
				type: "esm",
				contents: "export default {};",
			},
		},
	};
}

/** Existing remote proxy sessions keyed by Worker name. */
const remoteProxySessionsDataMap = new Map<
	string,
	RemoteProxySessionData | null
>();

function createRemoteBindingsLogger(logger: vite.Logger): RemoteBindingsLogger {
	const write = (
		level: "info" | "warn" | "error",
		args: Parameters<typeof console.log>
	) => logger[level](format(...args));

	return {
		loggerLevel: "log",
		debug() {},
		log: (...args) => write("info", args),
		info: (...args) => write("info", args),
		warn: (...args) => write("warn", args),
		error: (...args) => write("error", args),
		console(method, ...args) {
			if (method === "error") {
				write("error", args);
			} else if (method === "warn") {
				write("warn", args);
			} else if (method !== "debug" && method !== "trace") {
				write("info", args);
			}
		},
	};
}

function toRemoteComplianceRegion(
	region: "public" | "fedramp-high" | undefined
): "public" | "fedramp_high" | undefined {
	return region === "fedramp-high" ? "fedramp_high" : region;
}

function getWorkerZone(
	config: Pick<ParsedInputWorkerConfig, "triggers">
): string | undefined {
	const fetchTrigger = config.triggers?.find(
		(trigger) => trigger.type === "fetch"
	);
	return fetchTrigger?.type === "fetch" ? fetchTrigger.zone : undefined;
}

export async function getDevMiniflareOptions(
	ctx: AssetsOnlyPluginContext | WorkersPluginContext,
	viteDevServer: vite.ViteDevServer
): Promise<Extract<MiniflareOptions, { workers: WorkerOptions[] }>> {
	const inputInspectorPort = await getInputInspectorPort(ctx, viteDevServer);
	const { resolvedPluginConfig, resolvedViteConfig, entryWorkerConfig } = ctx;

	const assetsConfig = getAssetsConfig(
		resolvedPluginConfig,
		entryWorkerConfig,
		resolvedViteConfig
	);
	const [routerWorkerManifest, assetWorkerManifest, viteProxyWorkerManifest] =
		await Promise.all([
			getInternalWorkerManifest(ROUTER_WORKER_PATH),
			getInternalWorkerManifest(ASSET_WORKER_PATH),
			getInternalWorkerManifest(VITE_PROXY_WORKER_PATH),
		]);

	const assetWorkers: WorkerOptions[] = [
		{
			config: {
				type: "worker",
				name: ROUTER_WORKER_NAME,
				compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
				compatibilityFlags: ["enable_ctx_exports"],
				manifest: routerWorkerManifest,
				env: {
					CONFIG: {
						type: "json",
						value: {
							has_user_worker: resolvedPluginConfig.type === "workers",
						},
					},
					ASSET_WORKER: {
						type: "worker",
						worker: ASSET_WORKER_NAME,
					},
					...(entryWorkerConfig
						? {
								USER_WORKER: {
									type: "worker",
									worker: entryWorkerConfig.name,
								} satisfies MiniflareEnv[string],
							}
						: {}),
				},
			},
			dev: {
				unsafeRegisterWorker: false,
			},
		},
		{
			config: {
				type: "worker",
				name: ASSET_WORKER_NAME,
				compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
				manifest: assetWorkerManifest,
				env: {
					CONFIG: { type: "json", value: assetsConfig },
					__VITE_HEADERS__: {
						type: "text",
						value: JSON.stringify(viteDevServer.config.server.headers),
					},
					__VITE_HTML_EXISTS__: {
						type: "fetcher",
						handler: async (request) => {
							const { pathname } = new URL(request.url);

							if (pathname.endsWith(".html")) {
								const { root, publicDir } = resolvedViteConfig;
								const publicDirInRoot = publicDir.startsWith(
									withTrailingSlash(root)
								);
								const publicPath = withTrailingSlash(
									publicDir.slice(root.length)
								);

								// Assets in the public directory should be served at the root path
								if (publicDirInRoot && pathname.startsWith(publicPath)) {
									return MiniflareResponse.json(null);
								}

								const publicDirFilePath = path.join(publicDir, pathname);
								const rootDirFilePath = path.join(root, pathname);

								for (const resolvedPath of [
									publicDirFilePath,
									rootDirFilePath,
								]) {
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
					},
					__VITE_FETCH_HTML__: {
						type: "fetcher",
						handler: async (request) => {
							const { pathname } = new URL(request.url);

							try {
								const { root, publicDir } = resolvedViteConfig;
								const isInPublicDir = pathname.startsWith(PUBLIC_DIR_PREFIX);

								// HTML files in the public directory are served as-is (no
								// transform) from disk in both bundled and non-bundled dev.
								if (isInPublicDir) {
									const resolvedPath = path.join(
										publicDir,
										pathname.slice(PUBLIC_DIR_PREFIX.length)
									);
									const html = await fsp.readFile(resolvedPath, "utf-8");

									return new MiniflareResponse(html, {
										headers: { "Content-Type": "text/html" },
									});
								}

								const bundledDev = viteDevServer.environments.client.bundledDev;

								if (bundledDev) {
									// When the client environment runs in bundled dev mode
									// (`experimental.bundledDev`), the transformed HTML lives in
									// Vite's in-memory files rather than on disk. Serving it here
									// ensures the returned HTML references the bundled client
									// chunks (which Vite serves from `memoryFiles`) instead of the
									// raw source entry.
									//
									// Unlike Vite's `indexHtmlMiddleware`, which serves a fallback
									// loading page and relies on an HMR reload, we intentionally
									// block briefly and serve the real HTML.
									await bundledDev.triggerBundleRegenerationIfStale();

									const key = pathname.slice(1);
									let file = bundledDev.memoryFiles.get(key);
									const deadline = Date.now() + 10_000;
									while (!file && Date.now() < deadline) {
										await timers.setTimeout(10);
										file = bundledDev.memoryFiles.get(key);
									}

									if (!file) {
										throw new Error(
											`No bundled file for "${pathname}" after waiting for bundle regeneration.`
										);
									}

									const html =
										typeof file.source === "string"
											? file.source
											: Buffer.from(file.source);

									return new MiniflareResponse(html, {
										headers: { "Content-Type": "text/html" },
									});
								}

								// Non-bundled dev: read root HTML from disk and transform via Vite.
								const resolvedPath = path.join(root, pathname);
								let html = await fsp.readFile(resolvedPath, "utf-8");
								html = await viteDevServer.transformIndexHtml(
									resolvedPath,
									html
								);

								return new MiniflareResponse(html, {
									headers: { "Content-Type": "text/html" },
								});
							} catch (error) {
								throw new Error(
									`Unexpected error. Failed to load "${pathname}".`,
									{
										cause: error,
									}
								);
							}
						},
					},
				},
			},
			dev: {
				unsafeRegisterWorker: false,
			},
		},
		{
			config: {
				type: "worker",
				name: VITE_PROXY_WORKER_NAME,
				compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
				manifest: viteProxyWorkerManifest,
				env: {
					...(entryWorkerConfig
						? {
								ENTRY_USER_WORKER: {
									type: "worker",
									worker: entryWorkerConfig.name,
								} satisfies MiniflareEnv[string],
							}
						: {}),
					__VITE_MIDDLEWARE__: {
						type: "node-handler",
						handler: (req, res) => viteDevServer.middlewares(req, res),
					},
				},
			},
			dev: {
				unsafeRegisterWorker: false,
			},
		},
	];

	// TODO: Add Container Miniflare configuration when Containers are supported by
	// cloudflare.config.ts.
	const userWorkers =
		resolvedPluginConfig.type === "workers"
			? await Promise.all(
					[...resolvedPluginConfig.environmentNameToWorkerMap].map(
						async ([environmentName, worker]) => {
							const bindings = getRemoteBindings(worker.config);

							const preExistingRemoteProxySession =
								remoteProxySessionsDataMap.get(worker.config.name);
							const settings = resolvedPluginConfig.parsedConfig.settings;

							const remoteProxySessionData =
								!resolvedPluginConfig.remoteBindings
									? // if remote bindings are not enabled then the proxy session can simply be null
										null
									: await maybeStartOrUpdateRemoteProxySession(
											{
												name: worker.config.name,
												bindings: bindings ?? {},
												complianceRegion: toRemoteComplianceRegion(
													settings?.complianceRegion
												),
												account_id: settings?.accountId,
												profileDir: resolvedViteConfig.root,
											},
											preExistingRemoteProxySession ?? null,
											undefined,
											{
												logger: createRemoteBindingsLogger(
													viteDevServer.config.logger
												),
											}
										);

							if (remoteProxySessionData) {
								remoteProxySessionsDataMap.set(
									worker.config.name,
									remoteProxySessionData
								);
							}

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

							const {
								entrypoint: _entrypoint,
								assets: _assets,
								...config
							} = worker.config;
							const env: MiniflareEnv = {};
							for (const [name, binding] of Object.entries(config.env ?? {})) {
								if (binding.type === "hyperdrive") {
									assert(
										binding.dev?.connectionString !== undefined,
										`Hyperdrive binding "${name}" must define dev.connectionString for local development.`
									);
									env[name] = {
										...binding,
										dev: { connectionString: binding.dev.connectionString },
									};
								} else {
									env[name] = binding;
								}
							}
							for (const [name, binding] of Object.entries(env)) {
								if (binding.type === "assets") {
									env[name] = {
										type: "node-handler",
										handler: (req, res) => {
											req[kRequestType] = "asset";
											viteDevServer.middlewares(req, res);
										},
									};
								} else if (
									binding.type === "browser" &&
									getBrowserRenderingHeadfulFromEnv()
								) {
									env[name] = { ...binding, headful: true };
								}
							}
							env.__VITE_INVOKE_MODULE__ = {
								type: "fetcher",
								handler: async (request) => {
									const targetEnvironmentName = request.headers.get(
										ENVIRONMENT_NAME_HEADER
									);
									assert(
										targetEnvironmentName,
										`Expected ${ENVIRONMENT_NAME_HEADER} header`
									);
									const payload = (await request.json()) as vite.CustomPayload;
									const devEnvironment = viteDevServer.environments[
										targetEnvironmentName
									] as CloudflareDevEnvironment;
									const result = await devEnvironment.hot.handleInvoke(payload);
									return MiniflareResponse.json(result);
								},
							};
							env.__VITE_RUNNER_OBJECT__ = {
								type: "durable-object",
								worker: worker.config.name,
								exportName: "__VITE_RUNNER_OBJECT__",
							};
							const workerExports: MiniflareExports = {};
							for (const [name, workerExport] of Object.entries(
								config.exports ?? {}
							)) {
								if (
									workerExport.type === "durable-object" &&
									"storage" in workerExport
								) {
									const container =
										"container" in workerExport
											? workerExport.container
											: undefined;
									assert(
										container === undefined,
										`Container-backed Durable Object export "${name}" is not yet supported by cloudflare.config.ts.`
									);
									workerExports[name] = {
										...workerExport,
										container: undefined,
									};
								} else {
									workerExports[name] = workerExport;
								}
							}
							workerExports.__VITE_RUNNER_OBJECT__ = {
								type: "durable-object",
								storage: "sqlite",
								unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
								unsafePreventEviction: true,
							};

							return {
								config: {
									...config,
									env,
									exports: workerExports,
									manifest: await getUserWorkerManifest(wrappers.join("\n")),
								},
								dev: {
									zone: getWorkerZone(config),
									remoteProxyConnectionString:
										remoteProxySessionData?.session
											?.remoteProxyConnectionString,
									unsafeInspectorProxy: inputInspectorPort !== false,
									useModuleFallbackService: true,
									unsafeEvalBinding: "__VITE_UNSAFE_EVAL__",
									...(environmentName ===
									resolvedPluginConfig.entryWorkerEnvironmentName
										? { unsafeOverrideFetchWorker: VITE_PROXY_WORKER_NAME }
										: {}),
								},
							} satisfies WorkerOptions;
						}
					)
				)
			: [];

	const logger = new ViteMiniflareLogger(resolvedViteConfig);

	const serverConfig = viteDevServer.config.server;
	const publicUrl = buildPublicUrl({
		hostname:
			typeof serverConfig.host === "string" ? serverConfig.host : undefined,
		port: serverConfig.port,
		secure: !!serverConfig.https,
	});

	const miniflareOptions: MiniflareOptions = {
		log: logger,
		publicUrl,
		unsafeProxySharedSecret: PROXY_SHARED_SECRET,
		logRequests: false,
		inspectorPort:
			inputInspectorPort === false ? undefined : inputInspectorPort,
		unsafeDevRegistryPath: getDefaultDevRegistryPath(),
		unsafeTriggerHandlers: true,
		unsafeLocalExplorer: getLocalExplorerEnabledFromEnv(),
		// The switch for local observability capture: tells Miniflare core to
		// attach the trace collector to each user worker. Opt-in via the
		// `X_LOCAL_OBSERVABILITY` env var (defaults off); enabling it requires
		// restarting the dev server.
		unsafeObservability: getLocalObservabilityEnabledFromEnv(),
		telemetry: { enabled: false },
		handleStructuredLogs: getStructuredLogsLogger(logger),
		async unsafeHandleRuntimeRestart() {
			// Miniflare has restarted `workerd` after a crash, but the
			// module runners created over our separate bootstrap channel
			// died with the previous process. Restarting the Vite dev
			// server re-creates the environments, hot channels, and module
			// runners so requests are served again instead of failing with
			// an opaque `fetch failed`.
			debuglog(
				"workerd restarted after a crash; restarting the Vite dev server"
			);
			await viteDevServer.restart();
		},
		resourcePersistencePath: getPersistenceRoot(
			resolvedViteConfig.root,
			resolvedPluginConfig.persistState
		),
		resourceTmpPath: path.resolve(resolvedViteConfig.root, ".cloudflare/tmp"),
		workers: [...assetWorkers, ...userWorkers],
		async unsafeModuleFallbackService(request) {
			const parsed = await parseModuleFallbackRequest(request);

			if (!parsed) {
				return new MiniflareResponse("Invalid module fallback request", {
					status: 400,
				});
			}

			const rawSpecifier = parsed.rawSpecifier;
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
	};

	return miniflareOptions;
}

/**
 * Read a Build Output Specification manifest into Miniflare's native module
 * manifest shape.
 */
export async function getMiniflareManifest(
	bundle: Bundle
): Promise<NonNullable<WorkerOptions["config"]["manifest"]>> {
	const { mainModule } = bundle;
	const mainEntry = bundle.modules[mainModule];
	assert(
		mainEntry !== undefined,
		`Build Output Specification: \`mainModule\` "${mainModule}" is missing from \`modules\`.`
	);

	const modules: NonNullable<WorkerOptions["config"]["manifest"]>["modules"] =
		{};
	await Promise.all(
		Object.entries(bundle.modules).map(async ([modulePath, { type }]) => {
			const contents = await fsp.readFile(
				path.join(bundle.rootPath, modulePath)
			);
			modules[modulePath] = {
				type,
				contents:
					type === "wasm" || type === "data"
						? new Uint8Array(contents)
						: contents.toString(),
			};
		})
	);

	return {
		mainModule,
		modulesRoot: bundle.rootPath,
		modules,
	};
}

export async function getPreviewMiniflareOptions(
	ctx: PreviewPluginContext,
	vitePreviewServer: vite.PreviewServer
): Promise<Extract<MiniflareOptions, { workers: WorkerOptions[] }>> {
	const inputInspectorPort = await getInputInspectorPort(
		ctx,
		vitePreviewServer
	);
	const { resolvedPluginConfig, resolvedViteConfig } = ctx;
	// TODO: Add Container Miniflare configuration when Containers are supported by
	// cloudflare.config.ts.
	const workers: WorkerOptions[] = await Promise.all(
		resolvedPluginConfig.workers.map(async (previewWorker) => {
			const workerConfig = previewWorker.config;
			const bindings = getRemoteBindings(workerConfig);
			const preExistingRemoteProxySessionData = remoteProxySessionsDataMap.get(
				workerConfig.name
			);
			const remoteProxySessionData = !resolvedPluginConfig.remoteBindings
				? null
				: await maybeStartOrUpdateRemoteProxySession(
						{
							name: workerConfig.name,
							bindings: bindings ?? {},
							complianceRegion: toRemoteComplianceRegion(
								previewWorker.settings?.complianceRegion
							),
							account_id: previewWorker.settings?.accountId,
							profileDir: resolvedViteConfig.root,
						},
						preExistingRemoteProxySessionData ?? null,
						undefined,
						{
							logger: createRemoteBindingsLogger(
								vitePreviewServer.config.logger
							),
						}
					);

			if (remoteProxySessionData) {
				remoteProxySessionsDataMap.set(
					workerConfig.name,
					remoteProxySessionData
				);
			}

			const { manifest: _manifest, assets, exports, ...config } = workerConfig;
			const env: MiniflareEnv = {};
			for (const [name, binding] of Object.entries(config.env ?? {})) {
				if (binding.type === "hyperdrive") {
					assert(
						binding.dev?.connectionString !== undefined,
						`Hyperdrive binding "${name}" must define dev.connectionString for local development.`
					);
					env[name] = {
						...binding,
						dev: { connectionString: binding.dev.connectionString },
					};
				} else {
					env[name] = binding;
				}
			}
			const workerExports: MiniflareExports = {};
			for (const [name, workerExport] of Object.entries(exports ?? {})) {
				if (
					workerExport.type === "durable-object" &&
					"storage" in workerExport
				) {
					const container =
						"container" in workerExport ? workerExport.container : undefined;
					assert(
						container === undefined,
						`Container-backed Durable Object export "${name}" is not yet supported by cloudflare.config.ts.`
					);
					workerExports[name] = {
						...workerExport,
						container: undefined,
					};
				} else {
					workerExports[name] = workerExport;
				}
			}
			return {
				config: {
					...config,
					exports: workerExports,
					env,
					manifest: previewWorker.bundle
						? await getMiniflareManifest(previewWorker.bundle)
						: previewWorker.assetsDir
							? getAssetsOnlyManifest(resolvedViteConfig.root)
							: undefined,
					assets: previewWorker.assetsDir
						? {
								...assets,
								directory: previewWorker.assetsDir,
								hasUserWorker: previewWorker.bundle !== undefined,
							}
						: undefined,
				},
				dev: {
					zone: getWorkerZone(config),
					remoteProxyConnectionString:
						remoteProxySessionData?.session?.remoteProxyConnectionString,
					unsafeInspectorProxy: inputInspectorPort !== false,
				},
			} satisfies WorkerOptions;
		})
	);

	const logger = new ViteMiniflareLogger(resolvedViteConfig);

	const serverConfig = vitePreviewServer.config.preview;
	const publicUrl = buildPublicUrl({
		hostname:
			typeof serverConfig.host === "string" ? serverConfig.host : undefined,
		port: serverConfig.port,
		secure: !!serverConfig.https,
	});

	const miniflareOptions: MiniflareOptions = {
		log: logger,
		publicUrl,
		unsafeProxySharedSecret: PROXY_SHARED_SECRET,
		inspectorPort:
			inputInspectorPort === false ? undefined : inputInspectorPort,
		unsafeDevRegistryPath: getDefaultDevRegistryPath(),
		unsafeTriggerHandlers: true,
		unsafeLocalExplorer: getLocalExplorerEnabledFromEnv(),
		// The one switch for local observability: this env var tells Miniflare
		// core to attach the trace collector to each user worker.
		unsafeObservability: getLocalObservabilityEnabledFromEnv(),
		telemetry: { enabled: false },
		handleStructuredLogs: getStructuredLogsLogger(logger),
		resourcePersistencePath: getPersistenceRoot(
			resolvedViteConfig.root,
			resolvedPluginConfig.persistState
		),
		resourceTmpPath: path.resolve(resolvedViteConfig.root, ".cloudflare/tmp"),
		workers,
	};

	return miniflareOptions;
}

/**
 * A Miniflare logger that forwards messages onto a Vite logger.
 */
class ViteMiniflareLogger extends Log {
	#warnedCompatibilityDateFallback = false;

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

	override warn(message: string): void {
		// workerd emits a warning when the requested compatibility date is newer
		// than the binary supports. We intercept it here so we only show it once
		// and only when a newer version of the plugin is actually available on
		// npm — otherwise the warning is just noise the user cannot act on.
		if (!message.startsWith("The latest compatibility date supported by")) {
			this.logger.warn(message);
			return;
		}

		if (this.#warnedCompatibilityDateFallback) {
			return;
		}
		this.#warnedCompatibilityDateFallback = true;

		return void checkForNpmUpdate().then((result) => {
			if (result.status !== "update-available") {
				return;
			}
			this.logger.warn(
				`${message}\nFeatures enabled by your requested compatibility date may not be available.` +
					`\nUpgrade to \`@cloudflare/vite-plugin@${result.latest}\` to remove this warning.`
			);
			return;
		});
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
