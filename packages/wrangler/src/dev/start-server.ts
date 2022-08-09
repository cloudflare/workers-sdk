import { fork } from "node:child_process";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import onExit from "signal-exit";
import tmp from "tmp-promise";
import { bundleWorker } from "../bundle";
import { registerWorker } from "../dev-registry";
import { runCustomBuild } from "../entry";
import { logger } from "../logger";
import { waitForPortToBeAvailable } from "../proxy";
import {
	setupBindings,
	setupMiniflareOptions,
	setupNodeOptions,
} from "./local";
import { validateDevProps } from "./validate-dev-props";

import type { Config } from "../config";
import type { Entry } from "../entry";
import type { DevProps, DirectorySyncResult } from "./dev";
import type { LocalProps } from "./local";
import type { EsbuildBundle } from "./use-esbuild";

import type { ChildProcess } from "node:child_process";

export async function startDevServer(
	props: DevProps & {
		local: boolean;
	}
) {
	try {
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

		//implement a react-free version of useEsbuild
		const bundle = await runEsbuild({
			entry: props.entry,
			destination: directory.name,
			jsxFactory: props.jsxFactory,
			rules: props.rules,
			jsxFragment: props.jsxFragment,
			serveAssetsFromWorker: Boolean(
				props.assetPaths && !props.isWorkersSite && props.local
			),
			tsconfig: props.tsconfig,
			minify: props.minify,
			nodeCompat: props.nodeCompat,
			define: props.define,
			noBundle: props.noBundle,
			assets: props.assetsConfig,
			services: props.bindings.services,
		});

		//run local now
		const { stop, inspectorUrl } = await startLocalServer({
			name: props.name,
			bundle: bundle,
			format: props.entry.format,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			bindings: props.bindings,
			assetPaths: props.assetPaths,
			port: props.port,
			ip: props.ip,
			rules: props.rules,
			inspectorPort: props.inspectorPort,
			localPersistencePath: props.localPersistencePath,
			liveReload: props.liveReload,
			crons: props.crons,
			localProtocol: props.localProtocol,
			localUpstream: props.localUpstream,
			logLevel: props.logLevel,
			logPrefix: props.logPrefix,
			inspect: props.inspect,
			onReady: props.onReady,
			enablePagesAssetsServiceBinding: props.enablePagesAssetsServiceBinding,
			usageModel: undefined,
			workerDefinitions: undefined,
		});

		return {
			stop: async () => {
				stop();
			},
			inspectorUrl,
		};
	} catch (err) {
		logger.error(err);
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
	rules,
	assets,
	serveAssetsFromWorker,
	tsconfig,
	minify,
	nodeCompat,
	define,
	noBundle,
}: {
	entry: Entry;
	destination: string | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	rules: Config["rules"];
	assets: Config["assets"];
	define: Config["define"];
	services: Config["services"];
	serveAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	nodeCompat: boolean | undefined;
	noBundle: boolean;
}): Promise<EsbuildBundle | undefined> {
	if (!destination) return;

	const {
		resolvedEntryPointPath,
		bundleType,
		modules,
		sourceMapPath,
	}: Awaited<ReturnType<typeof bundleWorker>> = noBundle
		? {
				modules: [],
				resolvedEntryPointPath: entry.file,
				bundleType: entry.format === "modules" ? "esm" : "commonjs",
				stop: undefined,
				sourceMapPath: undefined,
		  }
		: await bundleWorker(entry, destination, {
				serveAssetsFromWorker,
				jsxFactory,
				jsxFragment,
				rules,
				tsconfig,
				minify,
				nodeCompat,
				define,
				checkFetch: true,
				assets: assets && {
					...assets,
					// disable the cache in dev
					bypassCache: true,
				},
				services: undefined,
				workerDefinitions: undefined,
				firstPartyWorkerDevFacade: undefined,
				targetConsumer: "dev", // We are starting a dev server
		  });

	return {
		id: 0,
		entry,
		path: resolvedEntryPointPath,
		type: bundleType,
		modules,
		sourceMapPath,
	};
}

export async function startLocalServer({
	name: workerName,
	bundle,
	format,
	compatibilityDate,
	compatibilityFlags,
	usageModel,
	bindings,
	workerDefinitions,
	assetPaths,
	port,
	inspectorPort,
	rules,
	localPersistencePath,
	liveReload,
	ip,
	crons,
	localProtocol,
	localUpstream,
	inspect,
	onReady,
	logLevel,
	logPrefix,
	enablePagesAssetsServiceBinding,
}: LocalProps) {
	let local: ChildProcess | undefined;
	let removeSignalExitListener: (() => void) | undefined;
	let inspectorUrl: string | undefined;
	const setInspectorUrl = (url: string) => {
		inspectorUrl = url;
	};

	const abortController = new AbortController();
	async function startLocalWorker() {
		if (!bundle || !format) return;

		// port for the worker

		if (port !== 0) {
			await waitForPortToBeAvailable(port, {
				retryPeriod: 200,
				timeout: 2000,
				abortSignal: abortController.signal,
			});
		}

		if (bindings.services && bindings.services.length > 0) {
			throw new Error(
				"⎔ Service bindings are not yet supported in local mode."
			);
		}

		// In local mode, we want to copy all referenced modules into
		// the output bundle directory before starting up
		for (const module of bundle.modules) {
			await writeFile(
				path.join(path.dirname(bundle.path), module.name),
				module.content
			);
		}

		const scriptPath = realpathSync(bundle.path);

		const upstream =
			typeof localUpstream === "string"
				? `${localProtocol}://${localUpstream}`
				: undefined;

		const {
			externalDurableObjects,
			internalDurableObjects,
			wasmBindings,
			textBlobBindings,
			dataBlobBindings,
		} = setupBindings({
			wasm_modules: bindings.wasm_modules,
			text_blobs: bindings.text_blobs,
			data_blobs: bindings.data_blobs,
			durable_objects: bindings.durable_objects,
			format,
			bundle,
		});

		const { forkOptions, miniflareCLIPath } = setupMiniflareOptions({
			workerName,
			port,
			scriptPath,
			localProtocol,
			ip,
			format,
			rules,
			compatibilityDate,
			compatibilityFlags,
			usageModel,
			kv_namespaces: bindings?.kv_namespaces,
			r2_buckets: bindings?.r2_buckets,
			internalDurableObjects,
			externalDurableObjects,
			localPersistencePath,
			liveReload,
			assetPaths,
			vars: bindings?.vars,
			wasmBindings,
			textBlobBindings,
			dataBlobBindings,
			crons,
			upstream,
			logLevel,
			logPrefix,
			workerDefinitions,
			enablePagesAssetsServiceBinding,
		});

		const nodeOptions = setupNodeOptions({ inspect, ip, inspectorPort });
		logger.log("⎔ Starting a local server...");

		const child = (local = fork(miniflareCLIPath, forkOptions, {
			cwd: path.dirname(scriptPath),
			execArgv: nodeOptions,
			stdio: "pipe",
		}));

		child.on("message", async (messageString) => {
			const message = JSON.parse(messageString as string);
			if (message.ready) {
				// Let's register our presence in the dev registry
				if (workerName) {
					await registerWorker(workerName, {
						protocol: localProtocol,
						mode: "local",
						port: message.mfPort,
						host: ip,
						durableObjects: internalDurableObjects.map((binding) => ({
							name: binding.name,
							className: binding.class_name,
						})),
						...(message.durableObjectsPort
							? {
									durableObjectsHost: ip,
									durableObjectsPort: message.durableObjectsPort,
							  }
							: {}),
					});
				}
				onReady?.(ip, message.mfPort);
			}
		});

		child.on("close", (code) => {
			if (code) {
				logger.log(`Miniflare process exited with code ${code}`);
			}
		});

		child.stdout?.on("data", (data: Buffer) => {
			process.stdout.write(data);
		});

		// parse the node inspector url (which may be received in chunks) from stderr
		let stderrData = "";
		let inspectorUrlFound = false;
		child.stderr?.on("data", (data: Buffer) => {
			if (!inspectorUrlFound) {
				stderrData += data.toString();
				const matches =
					/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9-]+)[\r|\n]/.exec(
						stderrData
					);
				if (matches) {
					inspectorUrlFound = true;
					setInspectorUrl(matches[1]);
				}
			}

			process.stderr.write(data);
		});

		child.on("exit", (code) => {
			if (code) {
				logger.error(`Miniflare process exited with code ${code}`);
			}
		});

		child.on("error", (error: Error) => {
			logger.error(`Miniflare process failed to spawn`);
			logger.error(error);
		});

		removeSignalExitListener = onExit((_code, _signal) => {
			logger.log("⎔ Shutting down local server.");
			child.kill();
			local = undefined;
		});
	}

	startLocalWorker().catch((err) => {
		logger.error("local worker:", err);
	});

	return {
		inspectorUrl,
		stop: () => {
			abortController.abort();
			if (local) {
				logger.log("⎔ Shutting down local server.");
				local.kill();
				local = undefined;
				removeSignalExitListener && removeSignalExitListener();
				removeSignalExitListener = undefined;
			}
		},
	};
}
