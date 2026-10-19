import * as path from "node:path";
import {
	BUILD_OUTPUT_ROOT,
	cleanBuildOutputDir,
	DEFAULT_WORKER_DIRECTORY_NAME,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	readBuildOutput,
	writeRootConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import {
	createMiniflareExports,
	getMiniflareManifest,
	getPersistenceRoot,
	loadCloudflareConfig,
	resolveLocalBindingsByWorkerName,
	warnForMissingSecrets,
} from "@cloudflare/workers-dev-shared";
import { loadDevVars, loadEnv } from "@cloudflare/workers-utils/local-env";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import { logger } from "@rsbuild/core";
import {
	getDefaultDevRegistryPath,
	Log,
	Miniflare,
	Request as MiniflareRequest,
} from "miniflare";
import {
	getManifestFromCompilation,
	getWorkerEnvironmentConfig,
	removeUnemittedFiles,
	WORKER_ENTRY_NAME,
} from "./worker-environment";
import type {
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { PersistState } from "@cloudflare/workers-dev-shared";
import type {
	RequestHandler,
	RsbuildDevServer,
	RsbuildPlugin,
} from "@rsbuild/core";
import type { MiniflareOptions, WorkerOptions } from "miniflare";
import type { IncomingMessage } from "node:http";

export interface PluginCloudflareOptions {
	/** Whether to persist local binding state between dev sessions. Defaults to `true`. */
	persistState?: PersistState;
	/** Options for generating `.cloudflare/types/index.d.ts`. */
	types?: { generate?: boolean; includeRuntime?: boolean };
}

/** The Rsbuild environment that builds the Worker. */
const ENVIRONMENT_NAME = "cloudflare";

/** Marks requests that the Worker's assets binding forwarded to Rsbuild. */
const kAssetRequest = Symbol("kAssetRequest");

type MiniflareWorkerConfig = WorkerOptions["config"];
type MiniflareManifest = NonNullable<MiniflareWorkerConfig["manifest"]>;
type LoadedConfig = Awaited<ReturnType<typeof loadCloudflareConfig>>;

/**
 * Rsbuild plugin that builds the Worker defined in `cloudflare.config.ts` with
 * rspack and runs it in workerd (via Miniflare) during `rsbuild dev`.
 * `rsbuild build` writes the Build Output Specification to `.cloudflare/output`,
 * which `rsbuild preview` runs in workerd.
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
			const isPreview = process.env.CLOUDFLARE_PREVIEW_BUILD === "true";
			let mode = "development";
			let loadedConfig: LoadedConfig;
			let devServer: RsbuildDevServer | undefined;
			let miniflare: Miniflare | undefined;
			let resolveMiniflare: (miniflare: Miniflare) => void = () => {};
			const miniflareReady = new Promise<Miniflare>((resolve) => {
				resolveMiniflare = resolve;
			});

			function getWorkerConfig(): ParsedInputWorkerConfig & {
				entrypoint: string;
			} {
				const worker = loadedConfig?.parsedConfig.worker;
				if (worker?.entrypoint === undefined) {
					throw new Error(
						"The Cloudflare Rsbuild plugin requires a `cloudflare.config.ts` that defines `worker.entrypoint`."
					);
				}
				return {
					...worker,
					entrypoint: path.resolve(root, worker.entrypoint),
				};
			}

			api.modifyRsbuildConfig(async (userConfig, { mergeRsbuildConfig }) => {
				if (action === "preview") {
					// Preview runs the Build Output rather than the project's sources,
					// and Rsbuild checks that this directory exists before starting.
					return mergeRsbuildConfig(userConfig, {
						output: { distPath: { root: BUILD_OUTPUT_ROOT } },
					});
				}

				mode =
					userConfig.mode ?? (action === "dev" ? "development" : "production");
				loadedConfig = await loadCloudflareConfig({
					root,
					mode,
					isPreview,
					types: {
						generate: options.types?.generate ?? true,
						includeRuntime: options.types?.includeRuntime ?? true,
					},
				});

				// Without explicit environments (Rsbuild defaults them to `{}`), Rsbuild
				// builds a single `web` environment from the top-level config, so keep
				// it when there is a client entry.
				const hasEnvironments =
					Object.keys(userConfig.environments ?? {}).length > 0;
				const environments = hasEnvironments
					? userConfig.environments
					: userConfig.source?.entry
						? { web: {} }
						: {};

				return mergeRsbuildConfig(userConfig, {
					environments: {
						...environments,
						[ENVIRONMENT_NAME]: getWorkerEnvironmentConfig(
							getWorkerConfig(),
							getWorkerBundleDir(root)
						),
					},
					dev: {
						watchFiles: {
							paths: loadedConfig
								? [loadedConfig.configPath, ...loadedConfig.dependencies]
								: [],
							type: "reload-server",
						},
					},
				});
			});

			api.modifyEnvironmentConfig((config, { name }) => {
				if (action === "preview") {
					return;
				}
				if (name === ENVIRONMENT_NAME) {
					// Top-level entries are merged into every environment, so replace
					// them to keep client entries out of the Worker.
					config.source.entry = getWorkerEnvironmentConfig(
						getWorkerConfig(),
						getWorkerBundleDir(root)
					).source?.entry;
				} else if (action === "build" && config.output.target === "web") {
					config.output.distPath.root = getWorkerAssetsDir(root);
				}
			});

			api.onBeforeStartDevServer(({ server }) => {
				devServer = server;
				// Runs after Rsbuild's built-in middleware, so client assets are
				// served first and every other request is handled by the Worker.
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
				if (
					environment.name !== ENVIRONMENT_NAME ||
					!stats ||
					stats.hasErrors()
				) {
					return;
				}
				if (action === "build") {
					await removeUnemittedFiles(environment.distPath, stats.compilation);
					return;
				}
				if (action !== "dev") {
					return;
				}

				await startOrUpdateMiniflare(
					await getDevMiniflareOptions({
						...getManifestFromCompilation(stats.compilation),
						modulesRoot: environment.distPath,
					})
				);
			});

			api.onCloseDevServer(async () => {
				await miniflare?.dispose();
			});

			api.onBeforeStartPreviewServer(async ({ server }) => {
				await startOrUpdateMiniflare(await getPreviewMiniflareOptions());
				// Rsbuild has no preview close hook, so dispose with the HTTP server.
				server.httpServer?.on("close", () => void miniflare?.dispose());
				// Added before Rsbuild's built-in middleware, so that Miniflare serves
				// the assets as well, as it would when deployed.
				server.middlewares.use(workerMiddleware);
			});

			api.onAfterBuild(async () => {
				await writeWorkerConfig({
					root,
					config: getWorkerConfig(),
					manifest: {
						type: "partial",
						mainModule: `${WORKER_ENTRY_NAME}.js`,
						modules: {},
					},
				});
				await writeRootConfig(
					root,
					{
						accountId: loadedConfig?.parsedConfig.accountId,
						complianceRegion: loadedConfig?.parsedConfig.complianceRegion,
					},
					{ isPreview, mode }
				);
			});

			async function startOrUpdateMiniflare(
				miniflareOptions: MiniflareOptions
			): Promise<void> {
				if (miniflare) {
					await miniflare.setOptions(miniflareOptions);
				} else {
					miniflare = new Miniflare(miniflareOptions);
					await miniflare.ready;
					resolveMiniflare(miniflare);
				}
			}

			/** Forwards a request to the Worker running in Miniflare. */
			const workerMiddleware: RequestHandler = async (req, res, next) => {
				if (kAssetRequest in req) {
					return next();
				}

				try {
					const request = createRequest(req, res);
					const response = await (
						await miniflareReady
					).dispatchFetch(
						new MiniflareRequest(request.url, {
							method: request.method,
							// The body is streamed back as-is, so ask for it uncompressed.
							headers: [["accept-encoding", "identity"], ...request.headers],
							body: request.body,
							duplex: "half",
							signal: request.signal,
							redirect: "manual",
						})
					);
					await sendResponse(res, response as unknown as Response);
				} catch (error) {
					next(error);
				}
			};

			async function getDevMiniflareOptions(
				manifest: MiniflareManifest
			): Promise<MiniflareOptions> {
				const {
					entrypoint: _entrypoint,
					assets: _assets,
					...config
				} = getWorkerConfig();
				const env = await getLocalBindings(config);
				// Rsbuild serves the client assets in dev, so the assets binding is
				// forwarded to its middleware.
				for (const [name, binding] of Object.entries(env)) {
					if (binding.type === "assets") {
						env[name] = {
							type: "node-handler",
							handler: (req: IncomingMessage, res) => {
								Object.assign(req, { [kAssetRequest]: true });
								devServer?.middlewares(req, res);
							},
						};
					}
				}
				return getMiniflareOptions({ ...config, env, manifest });
			}

			async function getPreviewMiniflareOptions(): Promise<MiniflareOptions> {
				const { workers, rootConfig } = await readBuildOutput(root);
				const worker = workers[DEFAULT_WORKER_DIRECTORY_NAME];
				const workerManifest = worker?.config.manifest;
				if (!worker?.bundleDir || !workerManifest) {
					throw new Error(
						"No Worker found in the Build Output. Run `rsbuild build` before `rsbuild preview`."
					);
				}
				// Load the same `.env` files as the build.
				mode = rootConfig.buildContext.mode ?? "production";
				const { manifest: _manifest, assets, ...config } = worker.config;
				return getMiniflareOptions({
					...config,
					env: await getLocalBindings(config),
					manifest: await getMiniflareManifest({
						...workerManifest,
						rootPath: worker.bundleDir,
					}),
					assets: worker.assetsDir
						? { ...assets, directory: worker.assetsDir, hasUserWorker: true }
						: undefined,
				});
			}

			/** Resolves the Worker's bindings, including values from `.env` and `.dev.vars` files. */
			async function getLocalBindings(
				config: Pick<
					ParsedInputWorkerConfig | ParsedOutputWorkerConfig,
					"name" | "env"
				>
			): Promise<NonNullable<MiniflareWorkerConfig["env"]>> {
				const [localEnv, devVars] = await Promise.all([
					loadEnv(root, mode),
					loadDevVars(root, mode),
				]);
				const localBindings = resolveLocalBindingsByWorkerName(
					[config],
					localEnv,
					devVars
				);
				warnForMissingSecrets(localBindings, mode, logger);
				return { ...localBindings.get(config.name)?.bindings };
			}

			function getMiniflareOptions({
				exports,
				...config
			}: Omit<MiniflareWorkerConfig, "exports"> & {
				exports?:
					| ParsedInputWorkerConfig["exports"]
					| ParsedOutputWorkerConfig["exports"];
			}): MiniflareOptions {
				return {
					log: new RsbuildMiniflareLog(),
					unsafeDevRegistryPath: getDefaultDevRegistryPath(),
					resourcePersistencePath: getPersistenceRoot(
						root,
						options.persistState ?? true
					),
					workers: [
						{
							config: {
								...config,
								// Containers aren't supported yet, so Container-backed exports throw.
								exports: createMiniflareExports({
									exports,
									containerRuntimeOptions: undefined,
								}),
							},
						},
					],
				};
			}
		},
	};
}

class RsbuildMiniflareLog extends Log {
	override logReady() {
		// Rsbuild prints its own server URLs.
	}
}
