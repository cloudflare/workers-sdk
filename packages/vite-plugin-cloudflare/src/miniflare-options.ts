import assert from "node:assert";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as timers from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	createContainerDevPlanForCfConfig,
	generateContainerBuildId,
	resolveDockerHost,
} from "@cloudflare/containers-shared";
import {
	createMiniflareExports,
	DevMiniflareLogger,
	getPreviewMiniflareOptions as getSharedPreviewMiniflareOptions,
	getAssetsConfig,
	getCommonMiniflareOptions,
	getDevAssetWorkerOptions,
	getInternalWorkerManifest,
	getRemoteProxySessionData,
	getWorkerZone,
	INTERNAL_WORKERS_COMPATIBILITY_DATE,
	kRequestType,
	miniflareModulesRoot,
	resolveLocalBindingsByWorkerName,
	VITE_PROXY_WORKER_NAME,
	warnForMissingSecrets,
} from "@cloudflare/workers-dev-shared";
import { getBrowserRenderingHeadfulFromEnv } from "@cloudflare/workers-utils";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import {
	buildPublicUrl,
	kUnsafeEphemeralUniqueKey,
	parseModuleFallbackRequest,
	Response as MiniflareResponse,
} from "miniflare";
import { getInputInspectorPort } from "./debug";
import { additionalModuleRE } from "./plugins/additional-modules";
import { ENVIRONMENT_NAME_HEADER } from "./shared";
import { checkForNpmUpdate } from "./update-check";
import {
	debuglog,
	satisfiesMinimumViteVersion,
	withTrailingSlash,
} from "./utils";
import type { CloudflareDevEnvironment } from "./cloudflare-environment";
import type {
	AssetsOnlyPluginContext,
	PreviewPluginContext,
	WorkersPluginContext,
} from "./context";
import type {
	ContainerDevOptions,
	ContainerDevPlan,
} from "@cloudflare/containers-shared";
import type { MiniflareOptions, WorkerOptions } from "miniflare";
import type * as vite from "vite";

// Used to mark HTML assets as being in the public directory so that they can be resolved from their root relative paths
const PUBLIC_DIR_PREFIX = "/__vite_public_dir__";

const VITE_PROXY_WORKER_PATH = "./workers/vite-proxy-worker/index.js";
const RUNNER_PATH = "./workers/runner-worker/index.js";
const MODULE_RUNNER_PATH = "./workers/runner-worker/module-runner.js";
const MODULE_RUNNER_LEGACY_PATH =
	"./workers/runner-worker/module-runner-legacy.js";
const WRAPPER_PATH = "__VITE_WORKER_ENTRY__";
type MiniflareEnv = NonNullable<WorkerOptions["config"]["env"]>;

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

export async function getDevMiniflareOptions(
	ctx: AssetsOnlyPluginContext | WorkersPluginContext,
	viteDevServer: vite.ViteDevServer
): Promise<{
	miniflareOptions: Extract<MiniflareOptions, { workers: WorkerOptions[] }>;
	containerOptions: ContainerDevOptions[] | undefined;
}> {
	const inputInspectorPort = await getInputInspectorPort(ctx, viteDevServer);
	const { resolvedPluginConfig, resolvedViteConfig, entryWorkerConfig } = ctx;

	const assetsConfig = getAssetsConfig(
		resolvedPluginConfig,
		entryWorkerConfig,
		{
			publicDir: resolvedViteConfig.publicDir,
			logger: resolvedViteConfig.logger,
		}
	);
	const resolvedLocalBindingsByWorkerName = resolveLocalBindingsByWorkerName(
		ctx.allWorkerConfigs,
		resolvedPluginConfig.localEnv,
		resolvedPluginConfig.devVars
	);
	warnForMissingSecrets(
		resolvedLocalBindingsByWorkerName,
		resolvedViteConfig.mode,
		viteDevServer.config.logger
	);
	const viteProxyWorkerManifest = await getInternalWorkerManifest(
		VITE_PROXY_WORKER_PATH,
		import.meta.url
	);

	const assetWorkers: WorkerOptions[] = [
		...(await getDevAssetWorkerOptions({
			baseUrl: import.meta.url,
			entryWorkerConfig,
			hasUserWorker: resolvedPluginConfig.type === "workers",
			assetsConfig,
			headers: viteDevServer.config.server.headers,
			html: {
				async htmlExists(pathname) {
					const { root, publicDir } = resolvedViteConfig;
					const publicDirInRoot = publicDir.startsWith(withTrailingSlash(root));
					const publicPath = withTrailingSlash(publicDir.slice(root.length));

					// Assets in the public directory should be served at the root path
					if (publicDirInRoot && pathname.startsWith(publicPath)) {
						return null;
					}

					const publicDirFilePath = path.join(publicDir, pathname);
					const rootDirFilePath = path.join(root, pathname);

					for (const resolvedPath of [publicDirFilePath, rootDirFilePath]) {
						try {
							const stats = await fsp.stat(resolvedPath);

							if (stats.isFile()) {
								return resolvedPath === publicDirFilePath
									? `${PUBLIC_DIR_PREFIX}${pathname}`
									: pathname;
							}
						} catch {}
					}

					return null;
				},
				async fetchHtml(pathname) {
					const { root, publicDir } = resolvedViteConfig;
					const isInPublicDir = pathname.startsWith(PUBLIC_DIR_PREFIX);

					// HTML files in the public directory are served as-is (no
					// transform) from disk in both bundled and non-bundled dev.
					if (isInPublicDir) {
						const resolvedPath = path.join(
							publicDir,
							pathname.slice(PUBLIC_DIR_PREFIX.length)
						);
						return fsp.readFile(resolvedPath, "utf-8");
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

						return typeof file.source === "string"
							? file.source
							: Buffer.from(file.source);
					}

					// Non-bundled dev: read root HTML from disk and transform via Vite.
					const resolvedPath = path.join(root, pathname);
					const html = await fsp.readFile(resolvedPath, "utf-8");
					return viteDevServer.transformIndexHtml(resolvedPath, html);
				},
			},
		})),
		{
			config: {
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

	const containerPlansByWorkerName = new Map<string, ContainerDevPlan>();
	const containerOptions: ContainerDevOptions[] = [];
	if (resolvedPluginConfig.type === "workers") {
		for (const worker of resolvedPluginConfig.environmentNameToWorkerMap.values()) {
			const plan = createContainerDevPlanForCfConfig({
				containers: resolvedPluginConfig.containers,
				exports: worker.config.exports,
				root: resolvedViteConfig.root,
				containerBuildId:
					resolvedPluginConfig.containers.length === 0
						? undefined
						: generateContainerBuildId(),
			});
			if (plan !== undefined) {
				containerPlansByWorkerName.set(worker.config.name, plan);
				containerOptions.push(...plan.containerOptions);
			}
		}
	}
	const containerEngine =
		containerPlansByWorkerName.size === 0
			? undefined
			: resolveDockerHost(getDockerPath());
	const userWorkers =
		resolvedPluginConfig.type === "workers"
			? await Promise.all(
					[...resolvedPluginConfig.environmentNameToWorkerMap].map(
						async ([environmentName, worker]) => {
							const remoteProxySessionData = await getRemoteProxySessionData(
								worker.config,
								{
									remoteBindings: resolvedPluginConfig.remoteBindings,
									settings: resolvedPluginConfig.settings,
									root: resolvedViteConfig.root,
									cliDisplayName: resolvedPluginConfig.cliDisplayName,
									logger: viteDevServer.config.logger,
								}
							);

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
							const resolvedLocalBindings =
								resolvedLocalBindingsByWorkerName.get(worker.config.name);
							assert(resolvedLocalBindings);
							const env = { ...resolvedLocalBindings.bindings };
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
							const workerExports = createMiniflareExports({
								exports: config.exports,
								containerRuntimeOptions: containerPlansByWorkerName.get(
									worker.config.name
								)?.containerRuntimeOptions,
							});
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

	const logger = getMiniflareLogger(resolvedViteConfig);

	const serverConfig = viteDevServer.config.server;
	const publicUrl = buildPublicUrl({
		hostname:
			typeof serverConfig.host === "string" ? serverConfig.host : undefined,
		port: serverConfig.port,
		secure: !!serverConfig.https,
	});

	const miniflareOptions: MiniflareOptions = {
		...getCommonMiniflareOptions({
			root: resolvedViteConfig.root,
			persistState: resolvedPluginConfig.persistState,
			logger,
			inspectorPort: inputInspectorPort,
			publicUrl,
			containerEngine,
		}),
		logRequests: false,
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

	return {
		miniflareOptions: miniflareOptions as Extract<
			MiniflareOptions,
			{ workers: WorkerOptions[] }
		>,
		containerOptions:
			containerPlansByWorkerName.size === 0 ? undefined : containerOptions,
	};
}

export async function getPreviewMiniflareOptions(
	ctx: PreviewPluginContext,
	vitePreviewServer: vite.PreviewServer
): ReturnType<typeof getSharedPreviewMiniflareOptions> {
	const { resolvedPluginConfig, resolvedViteConfig } = ctx;
	const serverConfig = vitePreviewServer.config.preview;

	return getSharedPreviewMiniflareOptions({
		resolvedPluginConfig,
		root: resolvedViteConfig.root,
		mode: resolvedViteConfig.mode,
		logger: vitePreviewServer.config.logger,
		miniflareLogger: getMiniflareLogger(resolvedViteConfig),
		inspectorPort: await getInputInspectorPort(ctx, vitePreviewServer),
		publicUrl: buildPublicUrl({
			hostname:
				typeof serverConfig.host === "string" ? serverConfig.host : undefined,
			port: serverConfig.port,
			secure: !!serverConfig.https,
		}),
	});
}

function getMiniflareLogger(config: vite.ResolvedConfig): DevMiniflareLogger {
	return new DevMiniflareLogger(config.logger, config.logLevel, {
		packageName: "@cloudflare/vite-plugin",
		checkForNpmUpdate,
	});
}
