import { fork } from "node:child_process";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import onExit from "signal-exit";
import tmp from "tmp-promise";
import { bundleWorker } from "../bundle";
import { runCustomBuild } from "../entry";
import { logger } from "../logger";
import { DEFAULT_MODULE_RULES } from "../module-collection";
import { getBasePath } from "../paths";
import { waitForPortToBeAvailable } from "../proxy";
import { validateDevProps } from "./validate-dev-props";

import type { Config } from "../config";
import type { Entry } from "../entry";
import type { DevProps, DirectorySyncResult } from "./dev";
import type { LocalProps } from "./local";
import type { EsbuildBundle } from "./use-esbuild";

import type { MiniflareOptions } from "miniflare";
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
			enableLocalPersistence: props.enableLocalPersistence,
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
	enableLocalPersistence,
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

	// if we're using local persistence for data, we should use the cwd
	// as an explicit path, or else it'll use the temp dir
	// which disappears when dev ends
	const localPersistencePath = enableLocalPersistence
		? // Maybe we could make the path configurable as well?
		  path.join(process.cwd(), "wrangler-local-state")
		: // We otherwise choose null, but choose true later
		  // so that it's persisted in the temp dir across a dev session
		  // even when we change source and reload
		  null;

	const abortController = new AbortController();
	async function startLocalWorker() {
		if (!bundle || !format) return;

		// port for the worker
		await waitForPortToBeAvailable(port, {
			retryPeriod: 200,
			timeout: 2000,
			abortSignal: abortController.signal,
		});

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

		// the wasm_modules/text_blobs/data_blobs bindings are
		// relative to process.cwd(), but the actual worker bundle
		// is in the temp output directory; so we rewrite the paths to be absolute,
		// letting miniflare resolve them correctly

		// wasm
		const wasmBindings: Record<string, string> = {};
		for (const [name, filePath] of Object.entries(
			bindings.wasm_modules || {}
		)) {
			wasmBindings[name] = path.join(process.cwd(), filePath);
		}

		// text
		const textBlobBindings: Record<string, string> = {};
		for (const [name, filePath] of Object.entries(bindings.text_blobs || {})) {
			textBlobBindings[name] = path.join(process.cwd(), filePath);
		}

		// data
		const dataBlobBindings: Record<string, string> = {};
		for (const [name, filePath] of Object.entries(bindings.data_blobs || {})) {
			dataBlobBindings[name] = path.join(process.cwd(), filePath);
		}

		if (format === "service-worker") {
			for (const { type, name } of bundle.modules) {
				if (type === "compiled-wasm") {
					// In service-worker format, .wasm modules are referenced by global identifiers,
					// so we convert it here.
					// This identifier has to be a valid JS identifier, so we replace all non alphanumeric
					// characters with an underscore.
					const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");
					wasmBindings[identifier] = name;
				} else if (type === "text") {
					// In service-worker format, text modules are referenced by global identifiers,
					// so we convert it here.
					// This identifier has to be a valid JS identifier, so we replace all non alphanumeric
					// characters with an underscore.
					const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");
					textBlobBindings[identifier] = name;
				} else if (type === "buffer") {
					// In service-worker format, data blobs are referenced by global identifiers,
					// so we convert it here.
					// This identifier has to be a valid JS identifier, so we replace all non alphanumeric
					// characters with an underscore.
					const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_");
					dataBlobBindings[identifier] = name;
				}
			}
		}

		const upstream =
			typeof localUpstream === "string"
				? `${localProtocol}://${localUpstream}`
				: undefined;

		const internalDurableObjects = (
			bindings.durable_objects?.bindings || []
		).filter((binding) => !binding.script_name);
		const externalDurableObjects = (
			bindings.durable_objects?.bindings || []
		).filter((binding) => binding.script_name);

		// TODO: This was already messy with the custom `disableLogs` and `logOptions`.
		// It's now getting _really_ messy now with Pages ASSETS binding outside and the external Durable Objects inside.
		const options: MiniflareOptions = {
			name: workerName,
			port,
			scriptPath,
			https: localProtocol === "https",
			host: ip,
			modules: format === "modules",
			modulesRules: (rules || [])
				.concat(DEFAULT_MODULE_RULES)
				.map(({ type, globs: include, fallthrough }) => ({
					type,
					include,
					fallthrough,
				})),
			compatibilityDate,
			compatibilityFlags,
			usageModel,
			kvNamespaces: bindings.kv_namespaces?.map((kv) => kv.binding),
			r2Buckets: bindings.r2_buckets?.map((r2) => r2.binding),
			durableObjects: Object.fromEntries(
				internalDurableObjects.map((binding) => [
					binding.name,
					binding.class_name,
				])
			),
			externalDurableObjects: Object.fromEntries(
				externalDurableObjects
					.map((binding) => {
						const service =
							workerDefinitions &&
							workerDefinitions[binding.script_name as string];
						if (!service) return [binding.name, undefined];

						const name = service.durableObjects.find(
							(durableObject) => durableObject.className === binding.class_name
						)?.name;
						if (!name) return [binding.name, undefined];

						return [
							binding.name,
							{
								name,
								host: service.durableObjectsHost,
								port: service.durableObjectsPort,
							},
						];
					})
					.filter(([_, details]) => !!details)
			),
			...(localPersistencePath
				? {
						cachePersist: path.join(localPersistencePath, "cache"),
						durableObjectsPersist: path.join(localPersistencePath, "do"),
						kvPersist: path.join(localPersistencePath, "kv"),
						r2Persist: path.join(localPersistencePath, "r2"),
				  }
				: {
						// We mark these as true, so that they'll
						// persist in the temp directory.
						// This means they'll persist across a dev session,
						// even if we change source and reload,
						// and be deleted when the dev session ends
						cachePersist: true,
						durableObjectsPersist: true,
						kvPersist: true,
						r2Persist: true,
				  }),

			liveReload,
			sitePath: assetPaths?.assetDirectory
				? path.join(assetPaths.baseDirectory, assetPaths.assetDirectory)
				: undefined,
			siteInclude: assetPaths?.includePatterns.length
				? assetPaths?.includePatterns
				: undefined,
			siteExclude: assetPaths?.excludePatterns.length
				? assetPaths.excludePatterns
				: undefined,
			bindings: bindings.vars,
			wasmBindings,
			textBlobBindings,
			dataBlobBindings,
			sourceMap: true,
			logUnhandledRejections: true,
			crons,
			upstream,
			disableLogs: logLevel === "none",
			logOptions: logPrefix ? { prefix: logPrefix } : undefined,
		};

		// The path to the Miniflare CLI assumes that this file is being run from
		// `wrangler-dist` and that the CLI is found in `miniflare-dist`.
		// If either of those paths change this line needs updating.

		const miniflareCLIPath = path.resolve(
			getBasePath(),
			"miniflare-dist/index.mjs"
		);
		const miniflareOptions = JSON.stringify(options, null);

		logger.log("⎔ Starting a local server...");
		const nodeOptions = [
			"--experimental-vm-modules", // ensures that Miniflare can run ESM Workers
			"--no-warnings", // hide annoying Node warnings
			// "--log=VERBOSE", // uncomment this to Miniflare to log "everything"!
		];
		if (inspect) {
			nodeOptions.push("--inspect=" + `${ip}:${inspectorPort}`); // start Miniflare listening for a debugger to attach
		}

		const forkOptions = [miniflareOptions];

		if (enablePagesAssetsServiceBinding) {
			forkOptions.push(JSON.stringify(enablePagesAssetsServiceBinding));
		}

		const child = (local = fork(miniflareCLIPath, forkOptions, {
			cwd: path.dirname(scriptPath),
			execArgv: nodeOptions,
			stdio: "pipe",
		}));

		child.on("message", (messageString) => {
			const message = JSON.parse(messageString as string);
			if (message.ready) {
				logger.log("firing onReady");
				onReady?.();
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
