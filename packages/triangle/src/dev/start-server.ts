import * as path from "node:path";
import * as util from "node:util";
import chalk from "chalk";
import onExit from "signal-exit";
import tmp from "tmp-promise";
import { bundleWorker, dedupeModulesByName } from "../bundle";
import {
	getBoundRegisteredWorkers,
	startWorkerRegistry,
	stopWorkerRegistry,
} from "../dev-registry";
import { runCustomBuild } from "../entry";
import { logger } from "../logger";
import traverseModuleGraph from "../traverse-module-graph";
import { localPropsToConfigBundle, maybeRegisterLocalWorker } from "./local";
import { MiniflareServer } from "./miniflare";
import { startRemoteServer } from "./remote";
import { validateDevProps } from "./validate-dev-props";
import type { Config } from "../config";
import type { DurableObjectBindings } from "../config/environment";
import type { WorkerRegistry } from "../dev-registry";
import type { Entry } from "../entry";
import type { CfModule } from "../worker";
import type { DevProps, DirectorySyncResult } from "./dev";
import type { LocalProps } from "./local";
import type { EsbuildBundle } from "./use-esbuild";

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

	const betaD1Shims = props.bindings.d1_databases?.map((db) => db.binding);

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
		betaD1Shims,
		workerDefinitions,
		services: props.bindings.services,
		firstPartyWorkerDevFacade: props.firstPartyWorker,
		testScheduled: props.testScheduled,
		local: props.local,
		doBindings: props.bindings.durable_objects?.bindings ?? [],
	});

	if (props.local) {
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
			inspect: props.inspect,
			onReady: props.onReady,
			enablePagesAssetsServiceBinding: props.enablePagesAssetsServiceBinding,
			usageModel: props.usageModel,
			workerDefinitions,
			sourceMapPath: bundle?.sourceMapPath,
		});

		return {
			stop: async () => {
				stop();
				await stopWorkerRegistry();
			},
			// TODO: inspectorUrl,
		};
	} else {
		const { stop } = await startRemoteServer({
			name: props.name,
			bundle: bundle,
			format: props.entry.format,
			accountId: props.accountId,
			bindings: props.bindings,
			assetPaths: props.assetPaths,
			isWorkersSite: props.isWorkersSite,
			port: props.initialPort,
			ip: props.initialIp,
			localProtocol: props.localProtocol,
			inspectorPort: props.inspectorPort,
			inspect: props.inspect,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			usageModel: props.usageModel,
			env: props.env,
			legacyEnv: props.legacyEnv,
			zone: props.zone,
			host: props.host,
			routes: props.routes,
			onReady: props.onReady,
			sourceMapPath: bundle?.sourceMapPath,
			sendMetrics: props.sendMetrics,
		});
		return {
			stop: async () => {
				stop();
				await stopWorkerRegistry();
			},
			// TODO: inspectorUrl,
		};
	}
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
	betaD1Shims,
	serveAssetsFromWorker,
	tsconfig,
	minify,
	legacyNodeCompat,
	nodejsCompat,
	define,
	noBundle,
	workerDefinitions,
	services,
	firstPartyWorkerDevFacade,
	testScheduled,
	local,
	doBindings,
}: {
	entry: Entry;
	destination: string | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	processEntrypoint: boolean;
	additionalModules: CfModule[];
	rules: Config["rules"];
	assets: Config["assets"];
	betaD1Shims?: string[];
	define: Config["define"];
	services: Config["services"];
	serveAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	legacyNodeCompat: boolean | undefined;
	nodejsCompat: boolean | undefined;
	noBundle: boolean;
	workerDefinitions: WorkerRegistry;
	firstPartyWorkerDevFacade: boolean | undefined;
	testScheduled?: boolean;
	local: boolean;
	doBindings: DurableObjectBindings;
}): Promise<EsbuildBundle | undefined> {
	if (!destination) return;

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
			betaD1Shims,
			workerDefinitions,
			services,
			firstPartyWorkerDevFacade,
			targetConsumer: "dev", // We are starting a dev server
			testScheduled,
			local,
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
			props.onReady?.(event.url.hostname, parseInt(event.url.port));
			// Note `unstable_dev` doesn't do anything with the inspector URL yet
			resolve({
				stop: () => {
					abortController.abort();
					logger.log("⎔ Shutting down local server...");
					// Initialisation errors are also thrown asynchronously by dispose().
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
