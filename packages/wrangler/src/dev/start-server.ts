import { once } from "node:events";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as util from "node:util";
import chalk from "chalk";
import onExit from "signal-exit";
import {
	convertCfWorkerInitBindingstoBindings,
	fakeResolvedInput,
} from "../api/startDevWorker/utils";
import { bundleWorker } from "../deployment-bundle/bundle";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { dedupeModulesByName } from "../deployment-bundle/dedupe-modules";
import { findAdditionalModules as doFindAdditionalModules } from "../deployment-bundle/find-additional-modules";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
	noopModuleCollector,
} from "../deployment-bundle/module-collection";
import { runCustomBuild } from "../deployment-bundle/run-custom-build";
import {
	getBoundRegisteredWorkers,
	startWorkerRegistry,
	stopWorkerRegistry,
} from "../dev-registry";
import { logger } from "../logger";
import { isNavigatorDefined } from "../navigator-user-agent";
import { getWranglerTmpDir } from "../paths";
import {
	getAccountChoices,
	requireApiToken,
	saveAccountToCache,
} from "../user";
import { localPropsToConfigBundle, maybeRegisterLocalWorker } from "./local";
import { DEFAULT_WORKER_NAME, MiniflareServer } from "./miniflare";
import { startRemoteServer } from "./remote";
import { validateDevProps } from "./validate-dev-props";
import type { ProxyData, StartDevWorkerInput, Trigger } from "../api";
import type { Config } from "../config";
import type { DurableObjectBindings } from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type { CfModule } from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";
import type { DevProps } from "./dev";
import type { LocalProps } from "./local";
import type { EsbuildBundle } from "./use-esbuild";
import type { NodeJSCompatMode } from "miniflare";

export async function startDevServer(
	props: DevProps & {
		local: boolean;
		disableDevRegistry: boolean;
		experimentalDevEnv: boolean;
	}
) {
	let workerDefinitions: WorkerRegistry = {};
	validateDevProps(props);

	if (props.build.command && !props.experimentalDevEnv) {
		const relativeFile =
			path.relative(props.entry.directory, props.entry.file) || ".";
		await runCustomBuild(props.entry.file, relativeFile, props.build).catch(
			(err) => {
				logger.error("Custom build failed:", err);
			}
		);
	}

	//implement a react-free version of useTmpDir
	const directory = setupTempDir(props.projectRoot);
	if (!directory) {
		throw new Error("Failed to create temporary directory.");
	}

	//start the worker registry
	logger.log("disableDevRegistry: ", props.disableDevRegistry);
	if (!props.disableDevRegistry && !props.experimentalDevEnv) {
		try {
			await startWorkerRegistry();
			if (props.local) {
				const boundRegisteredWorkers = await getBoundRegisteredWorkers({
					name: props.name,
					services: props.bindings.services,
					durableObjects: props.bindings.durable_objects,
				});

				if (
					!util.isDeepStrictEqual(boundRegisteredWorkers, workerDefinitions)
				) {
					workerDefinitions = boundRegisteredWorkers || {};
				}
			}
		} catch (err) {
			logger.error("failed to start worker registry", err);
		}
	}

	const devEnv = props.devEnv;
	const startDevWorkerOptions: StartDevWorkerInput = {
		name: props.name ?? "worker",
		config: props.rawConfig.configPath,
		entrypoint: props.entry.file,
		compatibilityDate: props.compatibilityDate,
		compatibilityFlags: props.compatibilityFlags,
		triggers: props.routes?.map<Extract<Trigger, { type: "route" }>>((r) => ({
			type: "route",
			...(typeof r === "string" ? { pattern: r } : r),
		})),
		bindings: convertCfWorkerInitBindingstoBindings(props.bindings),
		migrations: props.migrations,
		dev: {
			server: {
				hostname: props.initialIp,
				port: props.initialPort,
				secure: props.localProtocol === "https",
				httpsKeyPath: props.httpsKeyPath,
				httpsCertPath: props.httpsCertPath,
			},
			inspector: {
				port: props.inspectorPort,
			},
			origin: {
				secure: props.upstreamProtocol === "https",
				hostname: props.host ?? props.localUpstream,
			},
			liveReload: props.liveReload,
			remote: !props.forceLocal && !props.local,
			auth: async () => {
				let accountId = props.accountId;
				if (accountId === undefined) {
					const accountChoices = await getAccountChoices();
					if (accountChoices.length === 1) {
						saveAccountToCache({
							id: accountChoices[0].id,
							name: accountChoices[0].name,
						});
						accountId = accountChoices[0].id;
					} else {
						throw logger.error(
							"In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as `account_id` in your `wrangler.toml` file."
						);
					}
				}

				return { accountId, apiToken: requireApiToken() };
			},
			persist: props.localPersistencePath ?? undefined,
			testScheduled: props.testScheduled,
			registry: workerDefinitions,
		},
		build: {
			bundle: !props.noBundle,
			define: props.define,
			jsxFactory: props.jsxFactory,
			jsxFragment: props.jsxFragment,
			tsconfig: props.tsconfig,
			minify: props.minify,
			processEntrypoint: props.processEntrypoint,
			additionalModules: props.additionalModules,
			moduleRoot: props.entry.moduleRoot,
			moduleRules: props.rules,
			nodejsCompatMode: props.nodejsCompatMode,
		},
	};

	if (props.experimentalDevEnv) {
		// to comply with the current contract of this function, call props.onReady on reloadComplete
		devEnv.runtimes.forEach((runtime) => {
			runtime.on("reloadComplete", async (ev) => {
				const { proxyWorker } = await devEnv.proxy.ready.promise;
				const url = await proxyWorker.ready;

				props.onReady?.(url.hostname, parseInt(url.port), ev.proxyData);
			});
		});

		await devEnv.config.set(startDevWorkerOptions);

		const stop = async () => {
			await Promise.allSettled([stopWorkerRegistry(), devEnv.teardown()]);
		};

		try {
			await Promise.all([
				// adhere to unstable_dev contract:
				//   - only resolve when UserWorker is ready
				//   - reject if UserWorker fails to start
				Promise.race(
					devEnv.runtimes.flatMap((runtime) => [
						once(runtime, "reloadComplete"),
						once(runtime, "error").then((err) => Promise.reject(err)),
					])
				),
				// adhere to unstable_dev contract:
				//   - only resolve when _perceived_ UserWorker is ready
				//   - throw if _perceived_ UserWorker fails to start
				// to the eyeball, the ProxyWorker is the _perceived_ UserWorker
				Promise.race([
					devEnv.proxy.ready.promise,
					once(devEnv.proxy, "error").then((err) => Promise.reject(err)),
				]),
			]);
		} catch (err) {
			// unstable_dev's api only returns the stop function when the promise resolves
			// so call stop for the user if the promise rejects
			await stop();

			throw err;
		}

		return { stop };
	}

	// temp: fake these events by calling the handler directly
	devEnv.proxy.onConfigUpdate({
		type: "configUpdate",
		config: fakeResolvedInput(startDevWorkerOptions),
	});
	devEnv.proxy.onBundleStart({
		type: "bundleStart",
		config: fakeResolvedInput(startDevWorkerOptions),
	});

	//implement a react-free version of useEsbuild
	const bundle = await runEsbuild({
		entry: props.entry,
		destination: directory,
		jsxFactory: props.jsxFactory,
		processEntrypoint: props.processEntrypoint,
		additionalModules: props.additionalModules,
		rules: props.rules,
		jsxFragment: props.jsxFragment,
		serveLegacyAssetsFromWorker: Boolean(
			props.legacyAssetPaths && !props.isWorkersSite && props.local
		),
		tsconfig: props.tsconfig,
		minify: props.minify,
		nodejsCompatMode: props.nodejsCompatMode,
		define: props.define,
		noBundle: props.noBundle,
		findAdditionalModules: props.findAdditionalModules,
		alias: props.alias,
		legacyAssets: props.legacyAssetsConfig,
		testScheduled: props.testScheduled,
		local: props.local,
		doBindings: props.bindings.durable_objects?.bindings ?? [],
		mockAnalyticsEngineDatasets: props.bindings.analytics_engine_datasets ?? [],
		projectRoot: props.projectRoot,
		defineNavigatorUserAgent: isNavigatorDefined(
			props.compatibilityDate,
			props.compatibilityFlags
		),
	});

	if (props.local) {
		// temp: fake these events by calling the handler directly
		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config: fakeResolvedInput(startDevWorkerOptions),
			bundle,
		});
		const { stop } = await startLocalServer({
			name: props.name,
			bundle: bundle,
			format: props.entry.format,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			bindings: props.bindings,
			migrations: props.migrations,
			legacyAssetPaths: props.legacyAssetPaths,
			assets: props.assets,
			initialPort: undefined, // hard-code for userworker, DevEnv-ProxyWorker now uses this prop value
			initialIp: "127.0.0.1", // hard-code for userworker, DevEnv-ProxyWorker now uses this prop value
			rules: props.rules,
			inspectorPort: props.inspectorPort,
			runtimeInspectorPort: props.runtimeInspectorPort,
			localPersistencePath: props.localPersistencePath,
			liveReload: props.liveReload,
			crons: props.crons,
			queueConsumers: props.queueConsumers,
			localProtocol: props.localProtocol,
			httpsKeyPath: props.httpsKeyPath,
			httpsCertPath: props.httpsCertPath,
			localUpstream: props.localUpstream,
			upstreamProtocol: props.upstreamProtocol,
			inspect: true,
			onReady: async (ip, port, proxyData) => {
				// at this point (in the layers of onReady callbacks), we have devEnv in scope
				// so rewrite the onReady params to be the ip/port of the ProxyWorker instead of the UserWorker
				const { proxyWorker } = await devEnv.proxy.ready.promise;
				const url = await proxyWorker.ready;
				ip = url.hostname;
				port = parseInt(url.port);

				await maybeRegisterLocalWorker(
					url,
					props.name,
					proxyData.internalDurableObjects,
					proxyData.entrypointAddresses
				);

				props.onReady?.(ip, port, proxyData);

				// temp: fake these events by calling the handler directly
				if (!props.experimentalDevEnv) {
					devEnv.proxy.onReloadComplete({
						type: "reloadComplete",
						config: fakeResolvedInput(startDevWorkerOptions),
						bundle,
						proxyData,
					});
				}
			},
			enablePagesAssetsServiceBinding: props.enablePagesAssetsServiceBinding,
			usageModel: props.usageModel,
			workerDefinitions,
			sourceMapPath: bundle?.sourceMapPath,
			services: props.bindings.services,
			experimentalDevEnv: props.experimentalDevEnv,
		});

		return {
			stop: async () => {
				await Promise.allSettled([
					stop(),
					stopWorkerRegistry(),
					devEnv.teardown(),
				]);
			},
		};
	} else {
		const { stop } = await startRemoteServer({
			name: props.name,
			bundle: bundle,
			format: props.entry.format,
			accountId: props.accountId,
			bindings: props.bindings,
			legacyAssetPaths: props.legacyAssetPaths,
			isWorkersSite: props.isWorkersSite,
			port: props.initialPort,
			ip: props.initialIp,
			localProtocol: props.localProtocol,
			httpsKeyPath: props.httpsKeyPath,
			httpsCertPath: props.httpsCertPath,
			inspectorPort: props.inspectorPort,
			inspect: props.inspect,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			usageModel: props.usageModel,
			env: props.env,
			legacyEnv: props.legacyEnv,
			host: props.host,
			routes: props.routes,
			onReady: async (ip, port, proxyData) => {
				// at this point (in the layers of onReady callbacks), we have devEnv in scope
				// so rewrite the onReady params to be the ip/port of the ProxyWorker instead of the UserWorker
				const { proxyWorker } = await devEnv.proxy.ready.promise;
				const url = await proxyWorker.ready;
				ip = url.hostname;
				port = parseInt(url.port);

				props.onReady?.(ip, port, proxyData);

				// temp: fake these events by calling the handler directly
				if (!props.experimentalDevEnv) {
					devEnv.proxy.onReloadComplete({
						type: "reloadComplete",
						config: fakeResolvedInput(startDevWorkerOptions),
						bundle,
						proxyData,
					});
				}
			},
			sourceMapPath: bundle?.sourceMapPath,
			sendMetrics: props.sendMetrics,
			experimentalDevEnv: props.experimentalDevEnv,
			setAccountId: /* noop */ () => {},
		});

		return {
			stop: async () => {
				await Promise.allSettled([
					stop(),
					stopWorkerRegistry(),
					devEnv.teardown(),
				]);
			},
		};
	}
}

function setupTempDir(projectRoot: string | undefined): string | undefined {
	try {
		const dir = getWranglerTmpDir(projectRoot, "dev");
		return dir.path;
	} catch (err) {
		logger.error("Failed to create temporary directory to store built files.");
	}
}

async function runEsbuild({
	entry,
	destination,
	jsxFactory,
	jsxFragment,
	processEntrypoint,
	additionalModules,
	rules,
	alias,
	legacyAssets,
	serveLegacyAssetsFromWorker,
	tsconfig,
	minify,
	nodejsCompatMode,
	define,
	noBundle,
	findAdditionalModules,
	testScheduled,
	local,
	doBindings,
	mockAnalyticsEngineDatasets,
	projectRoot,
	defineNavigatorUserAgent,
}: {
	entry: Entry;
	destination: string;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	processEntrypoint: boolean;
	additionalModules: CfModule[];
	rules: Config["rules"];
	alias: Config["alias"];
	legacyAssets: Config["legacy_assets"];
	define: Config["define"];
	serveLegacyAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	nodejsCompatMode: NodeJSCompatMode | undefined;
	noBundle: boolean;
	findAdditionalModules: boolean | undefined;
	testScheduled?: boolean;
	local: boolean;
	doBindings: DurableObjectBindings;
	mockAnalyticsEngineDatasets: Config["analytics_engine_datasets"];
	projectRoot: string | undefined;
	defineNavigatorUserAgent: boolean;
}): Promise<EsbuildBundle> {
	if (noBundle) {
		additionalModules = dedupeModulesByName([
			...((await doFindAdditionalModules(entry, rules)) ?? []),
			...additionalModules,
		]);
	}

	const entryDirectory = path.dirname(entry.file);
	const moduleCollector = noBundle
		? noopModuleCollector
		: createModuleCollector({
				wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
					entryDirectory,
					entry.file
				),
				entry,
				findAdditionalModules: findAdditionalModules ?? false,
				rules,
			});

	const bundleResult =
		processEntrypoint || !noBundle
			? await bundleWorker(entry, destination, {
					bundle: !noBundle,
					additionalModules,
					moduleCollector,
					serveLegacyAssetsFromWorker,
					jsxFactory,
					jsxFragment,
					tsconfig,
					minify,
					nodejsCompatMode,
					define,
					checkFetch: true,
					mockAnalyticsEngineDatasets,
					alias,
					legacyAssets,
					// disable the cache in dev
					bypassAssetCache: true,
					targetConsumer: "dev", // We are starting a dev server
					local,
					testScheduled,
					doBindings,
					projectRoot,
					defineNavigatorUserAgent,
				})
			: undefined;

	const entrypointPath = bundleResult?.resolvedEntryPointPath ?? entry.file;
	return {
		id: 0,
		entry,
		path: entrypointPath,
		type: bundleResult?.bundleType ?? getBundleType(entry.format),
		modules: bundleResult ? bundleResult.modules : additionalModules,
		dependencies: bundleResult?.dependencies ?? {},
		sourceMapPath: bundleResult?.sourceMapPath,
		sourceMapMetadata: bundleResult?.sourceMapMetadata,
		entrypointSource: await readFile(entrypointPath, "utf8"),
	};
}

export async function startLocalServer(
	props: LocalProps & { experimentalDevEnv: boolean }
): Promise<{ stop: () => Promise<void> }> {
	if (!props.bundle || !props.format) {
		return { async stop() {} };
	}

	// Log warnings for experimental dev-registry-dependent options
	if (props.bindings.services && props.bindings.services.length > 0) {
		logger.warn(
			"⎔ Support for service bindings in local mode is experimental and may change."
		);
	}
	const externalDurableObjects = (
		props.bindings.durable_objects?.bindings || []
	).filter((binding) => binding.script_name);
	if (externalDurableObjects.length > 0) {
		logger.warn(
			"⎔ Support for external Durable Objects in local mode is experimental and may change."
		);
	}

	logger.log(chalk.dim("⎔ Starting local server..."));

	const config = await localPropsToConfigBundle(props);
	return new Promise<{ stop: () => Promise<void> }>((resolve, reject) => {
		const server = new MiniflareServer();
		server.addEventListener("reloaded", async (event) => {
			const proxyData: ProxyData = {
				userWorkerUrl: {
					protocol: event.url.protocol,
					hostname: event.url.hostname,
					port: event.url.port,
				},
				userWorkerInspectorUrl: {
					protocol: "ws:",
					hostname: "127.0.0.1",
					port: props.runtimeInspectorPort.toString(),
					pathname: `/core:user:${props.name ?? DEFAULT_WORKER_NAME}`,
				},
				userWorkerInnerUrlOverrides: {
					protocol: props.upstreamProtocol,
					hostname: props.localUpstream,
					port: props.localUpstream ? "" : undefined, // `localUpstream` was essentially `host`, not `hostname`, so if it was set delete the `port`
				},
				headers: {
					// Passing this signature from Proxy Worker allows the User Worker to trust the request.
					"MF-Proxy-Shared-Secret": event.proxyToUserWorkerAuthenticationSecret,
				},
				liveReload: props.liveReload,
				// in local mode, the logs are already being printed to the console by workerd but only for workers written in "module" format
				// workers written in "service-worker" format still need to proxy logs to the ProxyController
				proxyLogsToController: props.format === "service-worker",
				internalDurableObjects: event.internalDurableObjects,
				entrypointAddresses: event.entrypointAddresses,
			};

			props.onReady?.(event.url.hostname, parseInt(event.url.port), proxyData);
			// Note `unstable_dev` doesn't do anything with the inspector URL yet
			resolve({
				stop: async () => {
					abortController.abort();
					logger.log("⎔ Shutting down local server...");
					removeMiniflareServerExitListener();
					// Initialization errors are also thrown asynchronously by dispose().
					// The `addEventListener("error")` above should've caught them though.
					await server.onDispose();
				},
			});
		});
		server.addEventListener("error", ({ error }) => {
			logger.error("Error reloading local server:", error);
			reject(error);
		});
		const removeMiniflareServerExitListener = onExit(() => {
			logger.log(chalk.dim("⎔ Shutting down local server..."));
			void server.onDispose();
		});
		const abortController = new AbortController();
		void server.onBundleUpdate(config, { signal: abortController.signal });
	});
}
