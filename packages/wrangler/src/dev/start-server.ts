import * as path from "node:path";
import * as util from "node:util";
import chalk from "chalk";
import onExit from "signal-exit";
import tmp from "tmp-promise";
import { DevEnv, type StartDevWorkerOptions } from "../api";
import { bundleWorker, dedupeModulesByName } from "../deployment-bundle/bundle";
import { runCustomBuild } from "../deployment-bundle/run-custom-build";
import traverseModuleGraph from "../deployment-bundle/traverse-module-graph";
import {
	getBoundRegisteredWorkers,
	startWorkerRegistry,
	stopWorkerRegistry,
} from "../dev-registry";
import { logger } from "../logger";
import { localPropsToConfigBundle, maybeRegisterLocalWorker } from "./local";
import { DEFAULT_WORKER_NAME, MiniflareServer } from "./miniflare";
import { startRemoteServer } from "./remote";
import { validateDevProps } from "./validate-dev-props";
import type { ProxyData } from "../api";
import type { Config } from "../config";
import type { DurableObjectBindings } from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type { CfModule } from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";
import type { DevProps, DirectorySyncResult } from "./dev";
import type { LocalProps } from "./local";
import type { EsbuildBundle } from "./use-esbuild";
import {
	getAccountChoices,
	requireApiToken,
	saveAccountToCache,
} from "../user";

export async function startDevServer(
	props: DevProps & {
		local: boolean;
		disableDevRegistry: boolean;
	}
) {
	let workerDefinitions: WorkerRegistry = {};
	validateDevProps(props);

	if (props.build.command) {
		const relativeFile =
			path.relative(props.entry.directory, props.entry.file) || ".";
		await runCustomBuild(props.entry.file, relativeFile, props.build).catch(
			(err) => {
				logger.error("Custom build failed:", err);
			}
		);
	}

	//implement a react-free version of useTmpDir
	const directory = setupTempDir();
	if (!directory) {
		throw new Error("Failed to create temporary directory.");
	}

	//start the worker registry
	logger.log("disableDevRegistry: ", props.disableDevRegistry);
	if (!props.disableDevRegistry) {
		try {
			await startWorkerRegistry();
			if (props.local) {
				const boundRegisteredWorkers = await getBoundRegisteredWorkers({
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

	const devEnv = new DevEnv();
	const startDevWorkerOptions: StartDevWorkerOptions = {
		name: props.name ?? "worker",
		script: { contents: "" },
		dev: {
			server: {
				hostname: props.initialIp,
				port: props.initialPort,
				secure: props.localProtocol === "https",
			},
			inspector: {
				port: props.inspectorPort,
			},
			origin: {
				secure: props.localProtocol === "https",
				hostname: props.localUpstream,
			},
			liveReload: props.liveReload,
			remote: !props.local,
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
		},
	};

	// temp: fake these events by calling the handler directly
	devEnv.proxy.onConfigUpdate({
		type: "configUpdate",
		config: startDevWorkerOptions,
	});
	devEnv.proxy.onBundleStart({
		type: "bundleStart",
		config: startDevWorkerOptions,
	});

	//implement a react-free version of useEsbuild
	const bundle = await runEsbuild({
		entry: props.entry,
		destination: directory.name,
		jsxFactory: props.jsxFactory,
		processEntrypoint: props.processEntrypoint,
		additionalModules: props.additionalModules,
		rules: props.rules,
		jsxFragment: props.jsxFragment,
		serveAssetsFromWorker: Boolean(
			props.assetPaths && !props.isWorkersSite && props.local
		),
		tsconfig: props.tsconfig,
		minify: props.minify,
		legacyNodeCompat: props.legacyNodeCompat,
		nodejsCompat: props.nodejsCompat,
		define: props.define,
		noBundle: props.noBundle,
		assets: props.assetsConfig,
		workerDefinitions,
		services: props.bindings.services,
		testScheduled: props.testScheduled,
		local: props.local,
		doBindings: props.bindings.durable_objects?.bindings ?? [],
	});

	devEnv.runtimes.forEach((runtime) => {
		console.log("devEnv.runtimes.onBundleComplete()");
		runtime.onBundleComplete({
			type: "bundleComplete",
			config: startDevWorkerOptions,
			bundle,
		});
	});

	// to comply with the current contract of this function, call props.onReady on reloadComplete
	devEnv.runtimes.forEach((runtime) => {
		runtime.on("reloadComplete", async (ev) => {
			console.log("devEnv.runtimes.onReloadComplete");
			const { proxyWorker } = await devEnv.proxy.ready;
			const url = await proxyWorker.ready;

			props.onReady?.(url.hostname, parseInt(url.port), ev.proxyData);
		});
	});

	if (props.local) {
		console.log("UNSTABLE_DEV LOCAL MODE");
		// temp: fake these events by calling the handler directly
		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config: startDevWorkerOptions,
			bundle,
		});

		const { stop } = await startLocalServer({
			name: props.name,
			bundle: bundle,
			format: props.entry.format,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			bindings: props.bindings,
			assetPaths: props.assetPaths,
			initialPort: props.initialPort,
			initialIp: props.initialIp,
			rules: props.rules,
			inspectorPort: props.inspectorPort,
			runtimeInspectorPort: props.runtimeInspectorPort,
			localPersistencePath: props.localPersistencePath,
			liveReload: props.liveReload,
			crons: props.crons,
			queueConsumers: props.queueConsumers,
			localProtocol: props.localProtocol,
			localUpstream: props.localUpstream,
			inspect: true,
			onReady: async (ip, port, proxyData) => {
				// at this point (in the layers of onReady callbacks), we have devEnv in scope
				// so rewrite the onReady params to be the ip/port of the ProxyWorker instead of the UserWorker
				const { proxyWorker } = await devEnv.proxy.ready;
				const url = await proxyWorker.ready;
				ip = url.hostname;
				port = parseInt(url.port);

				props.onReady?.(ip, port, proxyData);

				// temp: fake these events by calling the handler directly
				devEnv.proxy.onReloadComplete({
					type: "reloadComplete",
					config: startDevWorkerOptions,
					bundle,
					proxyData,
				});
			},
			enablePagesAssetsServiceBinding: props.enablePagesAssetsServiceBinding,
			usageModel: props.usageModel,
			workerDefinitions,
			sourceMapPath: bundle?.sourceMapPath,
		});

		return {
			stop: async () => {
				stop();
				await stopWorkerRegistry();
				await devEnv.teardown();
			},
			// TODO: inspectorUrl,
		};
	}
	return {
		stop: async () => {
			await stopWorkerRegistry();
			await devEnv.teardown();
		},
		// TODO: inspectorUrl,
	};
}

function setupTempDir(): DirectorySyncResult | undefined {
	let dir: DirectorySyncResult | undefined;
	try {
		dir = tmp.dirSync({ unsafeCleanup: true });

		return dir;
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
	assets,
	serveAssetsFromWorker,
	tsconfig,
	minify,
	legacyNodeCompat,
	nodejsCompat,
	define,
	noBundle,
	workerDefinitions,
	services,
	testScheduled,
	doBindings,
}: {
	entry: Entry;
	destination: string;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	processEntrypoint: boolean;
	additionalModules: CfModule[];
	rules: Config["rules"];
	assets: Config["assets"];
	define: Config["define"];
	services: Config["services"];
	serveAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	legacyNodeCompat: boolean | undefined;
	nodejsCompat: boolean | undefined;
	noBundle: boolean;
	workerDefinitions: WorkerRegistry;
	testScheduled?: boolean;
	local: boolean;
	doBindings: DurableObjectBindings;
}): Promise<EsbuildBundle> {
	let traverseModuleGraphResult:
		| Awaited<ReturnType<typeof bundleWorker>>
		| undefined;
	let bundleResult: Awaited<ReturnType<typeof bundleWorker>> | undefined;
	if (noBundle) {
		traverseModuleGraphResult = await traverseModuleGraph(entry, rules);
	}

	if (processEntrypoint || !noBundle) {
		bundleResult = await bundleWorker(entry, destination, {
			bundle: !noBundle,
			disableModuleCollection: noBundle,
			serveAssetsFromWorker,
			jsxFactory,
			jsxFragment,
			rules,
			tsconfig,
			minify,
			legacyNodeCompat,
			nodejsCompat,
			define,
			checkFetch: true,
			assets: assets && {
				...assets,
				// disable the cache in dev
				bypassCache: true,
			},
			workerDefinitions,
			services,
			targetConsumer: "dev", // We are starting a dev server
			testScheduled,
			doBindings,
			additionalModules: dedupeModulesByName([
				...(traverseModuleGraphResult?.modules ?? []),
				...additionalModules,
			]),
		});
	}

	return {
		id: 0,
		entry,
		path: bundleResult?.resolvedEntryPointPath ?? entry.file,
		type:
			bundleResult?.bundleType ??
			(entry.format === "modules" ? "esm" : "commonjs"),
		modules: bundleResult
			? bundleResult.modules
			: dedupeModulesByName([
					...(traverseModuleGraphResult?.modules ?? []),
					...additionalModules,
			  ]),
		dependencies: bundleResult?.dependencies ?? {},
		sourceMapPath: bundleResult?.sourceMapPath,
		sourceMapMetadata: bundleResult?.sourceMapMetadata,
	};
}

export async function startLocalServer(props: LocalProps) {
	if (!props.bundle || !props.format) return Promise.resolve({ stop() {} });

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
	return new Promise<{ stop: () => void }>((resolve, reject) => {
		const server = new MiniflareServer();
		server.addEventListener("reloaded", async (event) => {
			await maybeRegisterLocalWorker(event, props.name);

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

				headers: {},
				liveReload: props.liveReload,
			};

			props.onReady?.(event.url.hostname, parseInt(event.url.port), proxyData);
			// Note `unstable_dev` doesn't do anything with the inspector URL yet
			resolve({
				stop: () => {
					abortController.abort();
					logger.log("⎔ Shutting down local server...");
					// Initialization errors are also thrown asynchronously by dispose().
					// The `addEventListener("error")` above should've caught them though.
					server.onDispose().catch(() => {});
					removeMiniflareServerExitListener();
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
