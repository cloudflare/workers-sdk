import assert from "node:assert";
import { fork } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { npxImport } from "npx-import";
import { useState, useEffect, useRef } from "react";
import onExit from "signal-exit";
import { registerWorker } from "../dev-registry";
import useInspector from "../inspect";
import { logger } from "../logger";
import {
	DEFAULT_MODULE_RULES,
	ModuleTypeToRuleType,
} from "../module-collection";
import { getBasePath } from "../paths";
import { waitForPortToBeAvailable } from "../proxy";
import type { Config } from "../config";
import type { WorkerRegistry } from "../dev-registry";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli";
import type { AssetPaths } from "../sites";
import type {
	CfWorkerInit,
	CfScriptFormat,
	CfWasmModuleBindings,
	CfTextBlobBindings,
	CfDataBlobBindings,
	CfDurableObject,
	CfKvNamespace,
	CfR2Bucket,
	CfVars,
	CfD1Database,
} from "../worker";
import type { EsbuildBundle } from "./use-esbuild";
import type {
	Miniflare as Miniflare3Type,
	MiniflareOptions as Miniflare3Options,
} from "@miniflare/tre";
import type { MiniflareOptions } from "miniflare";
import type { ChildProcess } from "node:child_process";

export interface LocalProps {
	name: string | undefined;
	bundle: EsbuildBundle | undefined;
	format: CfScriptFormat | undefined;
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	bindings: CfWorkerInit["bindings"];
	workerDefinitions: WorkerRegistry | undefined;
	assetPaths: AssetPaths | undefined;
	port: number;
	ip: string;
	rules: Config["rules"];
	inspectorPort: number;
	localPersistencePath: string | null;
	liveReload: boolean;
	crons: Config["triggers"]["crons"];
	localProtocol: "http" | "https";
	localUpstream: string | undefined;
	inspect: boolean;
	onReady: ((ip: string, port: number) => void) | undefined;
	logPrefix?: string;
	enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
	testScheduled?: boolean;
	experimentalLocal?: boolean;
}

export function Local(props: LocalProps) {
	const { inspectorUrl } = useLocalWorker(props);
	useInspector({
		inspectorUrl,
		port: props.inspectorPort,
		logToTerminal: false,
	});
	return null;
}

function useLocalWorker({
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
	logPrefix,
	enablePagesAssetsServiceBinding,
	experimentalLocal,
}: LocalProps) {
	// TODO: pass vars via command line
	const local = useRef<ChildProcess>();
	const experimentalLocalRef = useRef<Miniflare3Type>();
	const removeSignalExitListener = useRef<() => void>();
	const [inspectorUrl, setInspectorUrl] = useState<string | undefined>();

	useEffect(() => {
		if (bindings.services && bindings.services.length > 0) {
			logger.warn(
				"⎔ Support for service bindings in local mode is experimental and may change."
			);
		}
	}, [bindings.services]);

	useEffect(() => {
		const externalDurableObjects = (
			bindings.durable_objects?.bindings || []
		).filter((binding) => binding.script_name);

		if (externalDurableObjects.length > 0) {
			logger.warn(
				"⎔ Support for external Durable Objects in local mode is experimental and may change."
			);
		}
	}, [bindings.durable_objects?.bindings]);

	useEffect(() => {
		const abortController = new AbortController();
		async function startLocalWorker() {
			if (!bundle || !format) return;

			// port for the worker
			await waitForPortToBeAvailable(port, {
				retryPeriod: 200,
				timeout: 2000,
				abortSignal: abortController.signal,
			});

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
				d1_databases: bindings?.d1_databases,
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
				logPrefix,
				workerDefinitions,
				enablePagesAssetsServiceBinding,
			});

			if (experimentalLocal) {
				// TODO: refactor setupMiniflareOptions so we don't need to parse here
				const mf2Options: MiniflareOptions = JSON.parse(forkOptions[0]);
				const mf = await setupExperimentalLocal(mf2Options, format, bundle);
				await mf.ready;
				experimentalLocalRef.current = mf;
				removeSignalExitListener.current = onExit(() => {
					logger.log("⎔ Shutting down experimental local server.");
					mf.dispose();
					experimentalLocalRef.current = undefined;
				});
				return;
			}

			const nodeOptions = setupNodeOptions({ inspect, ip, inspectorPort });
			logger.log("⎔ Starting a local server...");

			const child = (local.current = fork(miniflareCLIPath, forkOptions, {
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
							port,
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

			removeSignalExitListener.current = onExit((_code, _signal) => {
				logger.log("⎔ Shutting down local server.");
				child.kill();
				local.current = undefined;
			});
		}

		startLocalWorker().catch((err) => {
			logger.error("local worker:", err);
		});

		return () => {
			abortController.abort();
			if (local.current) {
				logger.log("⎔ Shutting down local server.");
				local.current?.kill();
				local.current = undefined;
			}
			if (experimentalLocalRef.current) {
				logger.log("⎔ Shutting down experimental local server.");
				// Initialisation errors are also thrown asynchronously by dispose().
				// The catch() above should've caught them though.
				experimentalLocalRef.current?.dispose().catch(() => {});
				experimentalLocalRef.current = undefined;
			}
			removeSignalExitListener.current?.();
			removeSignalExitListener.current = undefined;
		};
	}, [
		bundle,
		workerName,
		format,
		port,
		inspectorPort,
		ip,
		bindings.durable_objects,
		bindings.kv_namespaces,
		bindings.r2_buckets,
		bindings.d1_databases,
		bindings.vars,
		bindings.services,
		workerDefinitions,
		compatibilityDate,
		compatibilityFlags,
		usageModel,
		localPersistencePath,
		liveReload,
		assetPaths,
		rules,
		bindings.wasm_modules,
		bindings.text_blobs,
		bindings.data_blobs,
		crons,
		localProtocol,
		localUpstream,
		inspect,
		logPrefix,
		onReady,
		enablePagesAssetsServiceBinding,
		experimentalLocal,
	]);
	return { inspectorUrl };
}

interface SetupBindingsProps {
	wasm_modules: CfWasmModuleBindings | undefined;
	text_blobs: CfTextBlobBindings | undefined;
	data_blobs: CfDataBlobBindings | undefined;
	durable_objects: { bindings: CfDurableObject[] } | undefined;
	bundle: EsbuildBundle;
	format: CfScriptFormat;
}

export function setupBindings({
	wasm_modules,
	text_blobs,
	data_blobs,
	durable_objects,
	format,
	bundle,
}: SetupBindingsProps) {
	// the wasm_modules/text_blobs/data_blobs bindings are
	// relative to process.cwd(), but the actual worker bundle
	// is in the temp output directory; so we rewrite the paths to be absolute,
	// letting miniflare resolve them correctly

	// wasm
	const wasmBindings: Record<string, string> = {};
	for (const [name, filePath] of Object.entries(wasm_modules || {})) {
		wasmBindings[name] = path.join(process.cwd(), filePath);
	}

	// text
	const textBlobBindings: Record<string, string> = {};
	for (const [name, filePath] of Object.entries(text_blobs || {})) {
		textBlobBindings[name] = path.join(process.cwd(), filePath);
	}

	// data
	const dataBlobBindings: Record<string, string> = {};
	for (const [name, filePath] of Object.entries(data_blobs || {})) {
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

	const internalDurableObjects = (durable_objects?.bindings || []).filter(
		(binding) => !binding.script_name
	);
	const externalDurableObjects = (durable_objects?.bindings || []).filter(
		(binding) => binding.script_name
	);
	return {
		internalDurableObjects,
		externalDurableObjects,
		wasmBindings,
		textBlobBindings,
		dataBlobBindings,
	};
}

interface SetupMiniflareOptionsProps {
	workerName: string | undefined;
	port: number;
	scriptPath: string;
	localProtocol: "http" | "https";
	ip: string;
	format: CfScriptFormat;
	rules: Config["rules"];
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	kv_namespaces: CfKvNamespace[] | undefined;
	r2_buckets: CfR2Bucket[] | undefined;
	d1_databases: CfD1Database[] | undefined;
	internalDurableObjects: CfDurableObject[];
	externalDurableObjects: CfDurableObject[];
	localPersistencePath: string | null;
	liveReload: boolean;
	assetPaths: AssetPaths | undefined;
	vars: CfVars | undefined;
	wasmBindings: Record<string, string>;
	textBlobBindings: Record<string, string>;
	dataBlobBindings: Record<string, string>;
	crons: Config["triggers"]["crons"];
	upstream: string | undefined;
	logPrefix: string | undefined;
	workerDefinitions: WorkerRegistry | undefined;
	enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
}

export function setupMiniflareOptions({
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
	kv_namespaces,
	r2_buckets,
	d1_databases,
	internalDurableObjects,
	externalDurableObjects,
	localPersistencePath,
	liveReload,
	assetPaths,
	vars,
	wasmBindings,
	textBlobBindings,
	dataBlobBindings,
	crons,
	upstream,
	logPrefix,
	workerDefinitions,
	enablePagesAssetsServiceBinding,
}: SetupMiniflareOptionsProps): {
	miniflareCLIPath: string;
	forkOptions: string[];
} {
	// It's now getting _really_ messy now with Pages ASSETS binding outside and the external Durable Objects inside.
	const options = {
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
		kvNamespaces: kv_namespaces?.map((kv) => kv.binding),
		r2Buckets: r2_buckets?.map((r2) => r2.binding),
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
		d1Databases: d1_databases?.map((db) => db.binding),
		...(localPersistencePath
			? {
					cachePersist: path.join(localPersistencePath, "cache"),
					durableObjectsPersist: path.join(localPersistencePath, "do"),
					kvPersist: path.join(localPersistencePath, "kv"),
					r2Persist: path.join(localPersistencePath, "r2"),
					d1Persist: path.join(localPersistencePath, "d1"),
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
		bindings: vars,
		wasmBindings,
		textBlobBindings,
		dataBlobBindings,
		sourceMap: true,
		logUnhandledRejections: true,
		crons,
		upstream,
		logLevel: logger.loggerLevel,
		logOptions: logPrefix ? { prefix: logPrefix } : undefined,
		enablePagesAssetsServiceBinding,
	};
	// The path to the Miniflare CLI assumes that this file is being run from
	// `wrangler-dist` and that the CLI is found in `miniflare-dist`.
	// If either of those paths change this line needs updating.
	const miniflareCLIPath = path.resolve(
		getBasePath(),
		"miniflare-dist/index.mjs"
	);
	const miniflareOptions = JSON.stringify(options, null);
	const forkOptions = [miniflareOptions];
	if (enablePagesAssetsServiceBinding) {
		forkOptions.push(JSON.stringify(enablePagesAssetsServiceBinding));
	}
	return { miniflareCLIPath, forkOptions };
}

export function setupNodeOptions({
	inspect,
	ip,
	inspectorPort,
}: {
	inspect: boolean;
	ip: string;
	inspectorPort: number;
}) {
	const nodeOptions = [
		"--experimental-vm-modules", // ensures that Miniflare can run ESM Workers
		"--no-warnings", // hide annoying Node warnings
		// "--log=VERBOSE", // uncomment this to Miniflare to log "everything"!
	];
	if (inspect) {
		nodeOptions.push("--inspect=" + `${ip}:${inspectorPort}`); // start Miniflare listening for a debugger to attach
	}
	return nodeOptions;
}

// Caching of the `npx-import`ed `@miniflare/tre` package
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let Miniflare: typeof import("@miniflare/tre").Miniflare;

function arrayToObject(values: string[] = []): Record<string, string> {
	return Object.fromEntries(values.map((value) => [value, value]));
}

export async function setupExperimentalLocal(
	mf2Options: MiniflareOptions,
	format: CfScriptFormat,
	bundle: EsbuildBundle
): Promise<Miniflare3Type> {
	const options: Miniflare3Options = {
		...mf2Options,
		// Miniflare 3 distinguishes between binding name and namespace/bucket IDs.
		// For now, just use the same value as we did in Miniflare 2.
		// TODO: use defined KV preview ID if any
		kvNamespaces: arrayToObject(mf2Options.kvNamespaces),
		r2Buckets: arrayToObject(mf2Options.r2Buckets),
	};

	if (format === "modules") {
		// Manually specify all modules from the bundle. If we didn't do this,
		// Miniflare 3 would try collect them automatically again itself.

		// Resolve entrypoint relative to the temporary directory, ensuring
		// path doesn't start with `..`, which causes issues in `workerd`.
		// Also ensures other modules with relative names can be resolved.
		const root = path.dirname(bundle.path);

		assert.strictEqual(bundle.type, "esm");
		options.modules = [
			// Entrypoint
			{
				type: "ESModule",
				path: path.relative(root, bundle.path),
				contents: await readFile(bundle.path, "utf-8"),
			},
			// Misc (WebAssembly, etc, ...)
			...bundle.modules.map((module) => ({
				type: ModuleTypeToRuleType[module.type ?? "esm"],
				path: module.name,
				contents: module.content,
			})),
		];
	}

	logger.log("⎔ Starting an experimental local server...");

	if (Miniflare === undefined) {
		({ Miniflare } = await npxImport<
			// eslint-disable-next-line @typescript-eslint/consistent-type-imports
			typeof import("@miniflare/tre")
		>("@miniflare/tre@next"));
	}

	return new Miniflare(options);
}
