import assert from "node:assert";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as timers from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { format } from "node:util";
import {
	generateContainerBuildId,
	resolveDockerHost,
} from "@cloudflare/containers-shared";
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
import { globSync } from "tinyglobby";
import * as wrangler from "wrangler";
import { getAssetsConfig } from "./asset-config";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	PROXY_SHARED_SECRET,
	ROUTER_WORKER_NAME,
	VITE_PROXY_WORKER_NAME,
} from "./constants";
import { getContainerOptions, getDockerPath } from "./containers";
import { getInputInspectorPort } from "./debug";
import { additionalModuleRE } from "./plugins/additional-modules";
import { ENVIRONMENT_NAME_HEADER } from "./shared";
import { checkForNpmUpdate } from "./update-check";
import {
	debuglog,
	satisfiesMinimumViteVersion,
	withTrailingSlash,
} from "./utils";
import type { Bundle } from "./build-output-preview";
import type { CloudflareDevEnvironment } from "./cloudflare-environment";
import type { ContainerTagToOptionsMap } from "./containers";
import type {
	AssetsOnlyPluginContext,
	PreviewPluginContext,
	WorkersPluginContext,
} from "./context";
import type { PersistState } from "./plugin-config";
import type { ModuleType } from "@cloudflare/config";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type { ConfigModuleRuleType, Json } from "@cloudflare/workers-utils";
import type {
	MiniflareBinding,
	MiniflareOptions,
	MiniflareWorkerConfig,
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

	const defaultPersistPath = ".wrangler/state";
	const persistPath = path.resolve(
		root,
		typeof persistState === "object" ? persistState.path : defaultPersistPath,
		"v3"
	);

	return persistPath;
}

const miniflareModulesRoot = process.platform === "win32" ? "Z:\\" : "/";
const internalWorkersRootPath = fileURLToPath(new URL(".", import.meta.url));
const ROUTER_WORKER_PATH = "./workers/router-worker/index.js";
const ASSET_WORKER_PATH = "./workers/asset-worker/index.js";
const VITE_PROXY_WORKER_PATH = "./workers/vite-proxy-worker/index.js";
const RUNNER_PATH = "./workers/runner-worker/index.js";
const MODULE_RUNNER_PATH = "./workers/runner-worker/module-runner.js";
const MODULE_RUNNER_LEGACY_PATH =
	"./workers/runner-worker/module-runner-legacy.js";
const WRAPPER_PATH = "__VITE_WORKER_ENTRY__";

type Manifest = NonNullable<MiniflareWorkerConfig["manifest"]>;
type Env = NonNullable<MiniflareWorkerConfig["env"]>;

function moduleName(modulePath: string): string {
	return modulePath.startsWith("./") ? modulePath.slice(2) : modulePath;
}

function toManifestContents(buffer: Buffer): Uint8Array<ArrayBuffer> {
	const contents = new Uint8Array(buffer.byteLength);
	contents.set(buffer);
	return contents;
}

function readManifestFileSync(filePath: string): Uint8Array<ArrayBuffer> {
	return toManifestContents(fs.readFileSync(filePath));
}

async function readManifestFile(
	filePath: string
): Promise<Uint8Array<ArrayBuffer>> {
	return toManifestContents(await fsp.readFile(filePath));
}

function readInternalWorkerModule(
	modulePath: string
): Manifest["modules"][string] {
	return {
		type: "esm",
		contents: readManifestFileSync(
			fileURLToPath(new URL(modulePath, import.meta.url))
		),
	};
}

function createManifest(
	rootPath: string,
	mainModule: string,
	modules: Manifest["modules"]
): Manifest {
	return { rootPath, mainModule, modules };
}

function createInternalWorkerOptions(options: {
	name: string;
	mainModule: string;
	compatibilityFlags?: string[];
	env?: Env;
}): WorkerOptions {
	const mainModule = moduleName(options.mainModule);
	return {
		config: {
			type: "worker",
			name: options.name,
			compatibilityDate: INTERNAL_WORKERS_COMPATIBILITY_DATE,
			compatibilityFlags: options.compatibilityFlags,
			env: options.env,
			manifest: createManifest(internalWorkersRootPath, mainModule, {
				[mainModule]: readInternalWorkerModule(options.mainModule),
			}),
		},
	};
}

function textBinding(value: string): MiniflareBinding {
	return { type: "text", value };
}

function jsonBinding(value: Json): MiniflareBinding {
	return { type: "json", value };
}

function workerBinding(workerName: string): MiniflareBinding {
	return { type: "worker", workerName };
}

/** Map that maps worker configPaths to their existing remote proxy session data (if any) */
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
		createInternalWorkerOptions({
			name: ROUTER_WORKER_NAME,
			mainModule: ROUTER_WORKER_PATH,
			compatibilityFlags: ["enable_ctx_exports"],
			env: {
				CONFIG: jsonBinding({
					has_user_worker: resolvedPluginConfig.type === "workers",
				}),
				ASSET_WORKER: workerBinding(ASSET_WORKER_NAME),
				...(entryWorkerConfig
					? { USER_WORKER: workerBinding(entryWorkerConfig.name) }
					: {}),
			},
		}),
		createInternalWorkerOptions({
			name: ASSET_WORKER_NAME,
			mainModule: ASSET_WORKER_PATH,
			env: {
				CONFIG: jsonBinding(assetsConfig),
				__VITE_HEADERS__: textBinding(
					JSON.stringify(viteDevServer.config.server.headers)
				),
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
							html = await viteDevServer.transformIndexHtml(resolvedPath, html);

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
		}),
		createInternalWorkerOptions({
			name: VITE_PROXY_WORKER_NAME,
			mainModule: VITE_PROXY_WORKER_PATH,
			env: {
				...(entryWorkerConfig
					? { ENTRY_USER_WORKER: workerBinding(entryWorkerConfig.name) }
					: {}),
				__VITE_MIDDLEWARE__: {
					type: "node-handler",
					handler: (req, res) => viteDevServer.middlewares(req, res),
				},
			},
		}),
	];

	const containerTagToOptionsMap: ContainerTagToOptionsMap = new Map();
	let containerEngine: string | undefined;

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
									: await maybeStartOrUpdateRemoteProxySession(
											{
												name: worker.config.name,
												bindings: bindings ?? {},
												complianceRegion: worker.config.compliance_region,
												account_id: worker.config.account_id,
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
								containerEngine = resolveDockerHost(dockerPath);
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

							const browserBinding = Object.values(
								workerOptions.config.env ?? {}
							).find((binding) => binding.type === "browser");
							if (browserBinding && getBrowserRenderingHeadfulFromEnv()) {
								browserBinding.headful = true;
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

							const moduleRunnerPath = satisfiesMinimumViteVersion("7.2.0")
								? MODULE_RUNNER_PATH
								: MODULE_RUNNER_LEGACY_PATH;
							const workerName = worker.config.name || "worker";
							const env = workerOptions.config.env ?? {};
							env.__VITE_RUNNER_OBJECT__ = {
								type: "durable-object",
								workerName,
								exportName: "__VITE_RUNNER_OBJECT__",
							};
							if (
								environmentName ===
									resolvedPluginConfig.entryWorkerEnvironmentName &&
								worker.config.assets?.binding
							) {
								env[worker.config.assets.binding] = {
									type: "node-handler",
									handler: (req, res) => {
										req[kRequestType] = "asset";
										viteDevServer.middlewares(req, res);
									},
								};
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

							return {
								externalWorkers,
								worker: {
									...workerOptions,
									config: {
										...workerOptions.config,
										name: workerName,
										env,
										exports: {
											...workerOptions.config.exports,
											__VITE_RUNNER_OBJECT__: {
												type: "durable-object",
												state: "created",
												storage: "legacy-kv",
												unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
												unsafePreventEviction: true,
											},
										},
										manifest: createManifest(
											miniflareModulesRoot,
											WRAPPER_PATH,
											{
												[WRAPPER_PATH]: {
													type: "esm",
													contents: wrappers.join("\n"),
												},
												[moduleName(RUNNER_PATH)]:
													readInternalWorkerModule(RUNNER_PATH),
												"workers/runner-worker/vite/module-runner":
													readInternalWorkerModule(moduleRunnerPath),
											}
										),
									},
									dev: {
										...workerOptions.dev,
										useModuleFallbackService: true,
										unsafeInspectorProxy: inputInspectorPort !== false,
										unsafeOverrideFetchWorker:
											environmentName ===
											resolvedPluginConfig.entryWorkerEnvironmentName
												? VITE_PROXY_WORKER_NAME
												: undefined,
										unsafeEvalBinding: "__VITE_UNSAFE_EVAL__",
									},
								} satisfies WorkerOptions,
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

	const serverConfig = viteDevServer.config.server;
	const publicUrl = buildPublicUrl({
		hostname:
			typeof serverConfig.host === "string" ? serverConfig.host : undefined,
		port: serverConfig.port,
		secure: !!serverConfig.https,
	});

	return {
		miniflareOptions: {
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
			resourceTmpPath: path.resolve(resolvedViteConfig.root, ".wrangler/tmp"),
			containerEngine,
			workers: [...assetWorkers, ...externalWorkers, ...userWorkers],
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

async function getPreviewManifest(
	main: string,
	rules: { type: ConfigModuleRuleType; globs: string[] }[]
): Promise<Manifest> {
	const rootPath = path.dirname(main);
	const entryPath = path.basename(main);
	const modules: Manifest["modules"] = {
		[entryPath]: { type: "esm", contents: await readManifestFile(main) },
	};

	for (const { type, globs } of rules) {
		const moduleType = ruleTypeToManifestModuleType(type);
		for (const globPath of globSync(globs, {
			cwd: rootPath,
			ignore: entryPath,
		})) {
			modules[globPath] = {
				type: moduleType,
				contents: await readManifestFile(path.join(rootPath, globPath)),
			};
		}
	}

	return createManifest(rootPath, entryPath, modules);
}

function ruleTypeToManifestModuleType(type: ConfigModuleRuleType): ModuleType {
	switch (type) {
		case "ESModule":
			return "esm";
		case "CommonJS":
			return "cjs";
		case "CompiledWasm":
			return "wasm";
		case "Text":
			return "text";
		case "Data":
			return "data";
		case "PythonModule":
			return "python";
		case "PythonRequirement":
			return "python-requirement";
	}
}

function isRuntimeManifestModuleType(type: ModuleType): boolean {
	switch (type) {
		case "esm":
		case "cjs":
		case "wasm":
		case "text":
		case "data":
		case "json":
		case "python":
		case "python-requirement":
			return true;
		case "sourcemap":
			return false;
	}
}

/**
 * Get Miniflare's manifest directly from the Build Output Specification
 * `modules` manifest. Module names stay relative for workerd and `rootPath`
 * provides absolute source URLs.
 */
export async function getModulesFromManifest(
	bundle: Bundle
): Promise<Manifest> {
	const { mainModule } = bundle;
	const mainEntry = bundle.modules[mainModule];
	assert(
		mainEntry !== undefined,
		`Build Output Specification: \`mainModule\` "${mainModule}" is missing from \`modules\`.`
	);

	const modules: Manifest["modules"] = {
		[mainModule]: {
			type: mainEntry.type,
			contents: await readManifestFile(path.join(bundle.rootPath, mainModule)),
		},
	};
	for (const [modulePath, value] of Object.entries(bundle.modules)) {
		if (modulePath !== mainModule && isRuntimeManifestModuleType(value.type)) {
			modules[modulePath] = {
				type: value.type,
				contents: await readManifestFile(
					path.join(bundle.rootPath, modulePath)
				),
			};
		}
	}

	return createManifest(bundle.rootPath, mainModule, modules);
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
	let containerEngine: string | undefined;

	const workers: Array<WorkerOptions> = (
		await Promise.all(
			resolvedPluginConfig.workers.map(async (previewWorker) => {
				const workerConfig = previewWorker.config;
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
					: await maybeStartOrUpdateRemoteProxySession(
							{
								name: workerConfig.name,
								bindings: bindings ?? {},
								complianceRegion: workerConfig.compliance_region,
								account_id: workerConfig.account_id,
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
					containerEngine = resolveDockerHost(dockerPath);
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

				const { externalWorkers, workerOptions } = miniflareWorkerOptions;

				// Build Output Specification workers carry an explicit modules manifest
				// that drives Miniflare's module loader directly, bypassing the
				// extension-glob-based discovery in `getPreviewModules`. This
				// preserves the exact module list (with its declared types)
				// rather than rediscovering it by walking the filesystem.
				return [
					{
						...workerOptions,
						config: {
							...workerOptions.config,
							name: workerOptions.config.name || workerConfig.name || "worker",
							manifest:
								previewWorker.source === "build-output" && previewWorker.bundle
									? await getModulesFromManifest(previewWorker.bundle)
									: miniflareWorkerOptions.main
										? await getPreviewManifest(
												miniflareWorkerOptions.main,
												workerConfig.rules
											)
										: createManifest("", "index.mjs", {
												"index.mjs": {
													type: "esm",
													contents: "export default {}",
												},
											}),
						},
						dev: {
							...workerOptions.dev,
							unsafeInspectorProxy: inputInspectorPort !== false,
						},
					},
					...externalWorkers,
				] satisfies Array<WorkerOptions>;
			})
		)
	).flat();

	const logger = new ViteMiniflareLogger(resolvedViteConfig);

	const serverConfig = vitePreviewServer.config.preview;
	const publicUrl = buildPublicUrl({
		hostname:
			typeof serverConfig.host === "string" ? serverConfig.host : undefined,
		port: serverConfig.port,
		secure: !!serverConfig.https,
	});

	return {
		miniflareOptions: {
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
			resourceTmpPath: path.resolve(resolvedViteConfig.root, ".wrangler/tmp"),
			containerEngine,
			workers,
		},
		containerTagToOptionsMap,
	};
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
