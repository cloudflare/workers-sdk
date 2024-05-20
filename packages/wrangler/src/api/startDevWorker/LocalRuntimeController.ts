import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import getPort from "get-port";
import { Miniflare, Mutex } from "miniflare";
import { DEFAULT_INSPECTOR_PORT } from "../..";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import * as MF from "../../dev/miniflare";
import { RuntimeController } from "./BaseController";
import { castErrorCause } from "./events";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type { WorkerEntrypointsDefinition } from "../../dev-registry";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";
import type { File, ServiceFetch, StartDevWorkerOptions } from "./types";

async function getBinaryFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (file.contents instanceof Buffer) {
			return file.contents;
		}
		return Buffer.from(file.contents);
	}
	return readFile(file.path);
}
async function getTextFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (typeof file.contents === "string") {
			return file.contents;
		}
		if (file.contents instanceof Buffer) {
			return file.contents.toString();
		}
		return Buffer.from(file.contents).toString();
	}
	return readFile(file.path, "utf8");
}

export const DEFAULT_WORKER_NAME = "worker";
function getName(config: StartDevWorkerOptions) {
	return config.name ?? DEFAULT_WORKER_NAME;
}

async function convertToConfigBundle(
	event: BundleCompleteEvent
): Promise<MF.ConfigBundle> {
	const bindings: CfWorkerInit["bindings"] = {
		vars: undefined,
		kv_namespaces: undefined,
		send_email: undefined,
		wasm_modules: undefined,
		text_blobs: undefined,
		browser: undefined,
		ai: undefined,
		version_metadata: undefined,
		data_blobs: undefined,
		durable_objects: undefined,
		queues: undefined,
		r2_buckets: undefined,
		d1_databases: undefined,
		vectorize: undefined,
		constellation: undefined,
		hyperdrive: undefined,
		services: undefined,
		analytics_engine_datasets: undefined,
		dispatch_namespaces: undefined,
		mtls_certificates: undefined,
		logfwdr: undefined,
		unsafe: undefined,
	};

	const fetchers: Record<string, ServiceFetch> = {};

	for (const [name, binding] of Object.entries(event.config.bindings ?? {})) {
		binding.type;
		if (binding.type === "plain_text") {
			bindings.vars ??= {};
			bindings.vars[name] = binding.value;
		} else if (binding.type === "json") {
			bindings.vars ??= {};
			bindings.vars[name] = binding.value;
		} else if (binding.type === "kv_namespace") {
			bindings.kv_namespaces ??= [];
			bindings.kv_namespaces.push({ ...binding, binding: name });
		} else if (binding.type === "send_email") {
			bindings.send_email ??= [];
			bindings.send_email.push({ ...binding, name: name });
		} else if (binding.type === "wasm_module") {
			bindings.wasm_modules ??= {};
			bindings.wasm_modules[name] = await getBinaryFileContents(binding.source);
		} else if (binding.type === "text_blob") {
			bindings.text_blobs ??= {};
			bindings.text_blobs[name] = binding.source.path as string;
		} else if (binding.type === "data_blob") {
			bindings.data_blobs ??= {};
			bindings.data_blobs[name] = await getBinaryFileContents(binding.source);
		} else if (binding.type === "browser") {
			bindings.browser = { binding: name };
		} else if (binding.type === "ai") {
			bindings.ai = { binding: name };
		} else if (binding.type === "version_metadata") {
			bindings.version_metadata = { binding: name };
		} else if (binding.type === "durable_object_namespace") {
			bindings.durable_objects ??= { bindings: [] };
			bindings.durable_objects.bindings.push({ ...binding, name: name });
		} else if (binding.type === "queue") {
			bindings.queues ??= [];
			bindings.queues.push({ ...binding, binding: name });
		} else if (binding.type === "r2_bucket") {
			bindings.r2_buckets ??= [];
			bindings.r2_buckets.push({ ...binding, binding: name });
		} else if (binding.type === "d1") {
			bindings.d1_databases ??= [];
			bindings.d1_databases.push({ ...binding, binding: name });
		} else if (binding.type === "vectorize") {
			bindings.vectorize ??= [];
			bindings.vectorize.push({ ...binding, binding: name });
		} else if (binding.type === "constellation") {
			bindings.constellation ??= [];
			bindings.constellation.push({ ...binding, binding: name });
		} else if (binding.type === "hyperdrive") {
			bindings.hyperdrive ??= [];
			bindings.hyperdrive.push({ ...binding, binding: name });
		} else if (binding.type === "service") {
			bindings.services ??= [];
			bindings.services.push({ ...binding, binding: name });
		} else if (binding.type === "fetcher") {
			fetchers[name] = binding.fetcher;
		} else if (binding.type === "analytics_engine") {
			bindings.analytics_engine_datasets ??= [];
			bindings.analytics_engine_datasets.push({ ...binding, binding: name });
		} else if (binding.type === "dispatch_namespace") {
			bindings.dispatch_namespaces ??= [];
			bindings.dispatch_namespaces.push({ ...binding, binding: name });
		} else if (binding.type === "mtls_certificate") {
			bindings.mtls_certificates ??= [];
			bindings.mtls_certificates.push({ ...binding, binding: name });
		} else if (binding.type === "logfwdr") {
			bindings.logfwdr ??= { bindings: [] };
			bindings.logfwdr.bindings.push({ ...binding, name: name });
		} else if (binding.type.startsWith("unsafe-")) {
			bindings.unsafe ??= {
				bindings: [],
				metadata: undefined,
				capnp: undefined,
			};
			bindings.unsafe.bindings?.push({ ...binding, name: name });
		}
	}

	const persistence = event.config.dev?.persist
		? getLocalPersistencePath(
				typeof event.config.dev?.persist === "object"
					? event.config.dev?.persist.path
					: undefined,
				event.config.config?.path
			)
		: null;

	const crons = [];
	const queueConsumers = [];
	for (const trigger of event.config.triggers ?? []) {
		if (trigger.type === "cron") {
			crons.push(trigger.cron);
		} else if (trigger.type === "queue-consumer") {
			queueConsumers.push(trigger);
		}
	}
	if (event.bundle.entry.format === "service-worker") {
		// For the service-worker format, blobs are accessible on the global scope
		for (const module of event.bundle.modules ?? []) {
			const identifier = MF.getIdentifier(module.name);
			if (module.type === "text") {
				bindings.vars ??= {};
				bindings.vars[identifier] = await getTextFileContents({
					contents: module.content,
				});
			} else if (module.type === "buffer") {
				bindings.data_blobs ??= {};
				bindings.data_blobs[identifier] = await getBinaryFileContents({
					contents: module.content,
				});
			} else if (module.type === "compiled-wasm") {
				bindings.wasm_modules ??= {};
				bindings.wasm_modules[identifier] = await getBinaryFileContents({
					contents: module.content,
				});
			}
		}
		event.bundle = { ...event.bundle, modules: [] };
	}

	return {
		name: event.config.name,
		bundle: event.bundle,
		format: event.bundle.entry.format,
		compatibilityDate: event.config.compatibilityDate,
		compatibilityFlags: event.config.compatibilityFlags,
		bindings,
		workerDefinitions: new Proxy(
			{},
			{
				get(_, name: string) {
					return event.config.dev?.getRegisteredWorker?.(name);
				},
			}
		),
		assetPaths: event.config.site?.path
			? {
					baseDirectory: event.config.site.path,
					assetDirectory: "",
					excludePatterns: event.config.site.exclude ?? [],
					includePatterns: event.config.site.include ?? [],
				}
			: undefined,
		initialPort: undefined,
		initialIp: "127.0.0.1",
		rules: [],
		// TODO: should we resolve this port?
		inspectorPort:
			event.config.dev?.inspector?.port ??
			(await getPort({ port: DEFAULT_INSPECTOR_PORT })),
		localPersistencePath: persistence,
		liveReload: event.config.dev?.liveReload ?? false,
		crons,
		queueConsumers,
		localProtocol: event.config.dev?.server?.secure ? "https" : "http",
		httpsCertPath: event.config.dev?.server?.httpsCertPath,
		httpsKeyPath: event.config.dev?.server?.httpsKeyPath,
		localUpstream: event.config.dev?.urlOverrides?.hostname,
		upstreamProtocol: event.config.dev?.urlOverrides?.secure ? "https" : "http",
		// TODO: is this a change?
		inspect: true,
		services: bindings.services,
		serviceBindings: fetchers,
	};
}

export class LocalRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	#log = MF.buildLog();
	#currentBundleId = 0;

	// This is given as a shared secret to the Proxy and User workers
	// so that the User Worker can trust aspects of HTTP requests from the Proxy Worker
	// if it provides the secret in a `MF-Proxy-Shared-Secret` header.
	#proxyToUserWorkerAuthenticationSecret = randomUUID();

	// `buildMiniflareOptions()` is asynchronous, meaning if multiple bundle
	// updates were submitted, the second may apply before the first. Therefore,
	// wrap updates in a mutex, so they're always applied in invocation order.
	#mutex = new Mutex();
	#mf?: Miniflare;

	onBundleStart(_: BundleStartEvent) {
		// Ignored in local runtime
	}

	async #onBundleComplete(data: BundleCompleteEvent, id: number) {
		try {
			const { options, internalObjects, entrypointNames } =
				await MF.buildMiniflareOptions(
					this.#log,
					await convertToConfigBundle(data),
					this.#proxyToUserWorkerAuthenticationSecret
				);
			if (this.#mf === undefined) {
				this.#mf = new Miniflare(options);
			} else {
				await this.#mf.setOptions(options);
			}
			// All asynchronous `Miniflare` methods will wait for all `setOptions()`
			// calls to complete before resolving. To ensure we get the `url` and
			// `inspectorUrl` for this set of `options`, we protect `#mf` with a mutex,
			// so only update can happen at a time.
			const userWorkerUrl = await this.#mf.ready;
			const userWorkerInspectorUrl = await this.#mf.getInspectorURL();
			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (id !== this.#currentBundleId) {
				return;
			}
			// Get entrypoint addresses
			const entrypointAddresses: WorkerEntrypointsDefinition = {};
			for (const name of entrypointNames) {
				const directUrl = await this.#mf.unsafeGetDirectURL(undefined, name);
				const port = parseInt(directUrl.port);
				entrypointAddresses[name] = { host: directUrl.hostname, port };
			}
			this.emitReloadCompleteEvent({
				type: "reloadComplete",
				config: data.config,
				bundle: data.bundle,
				proxyData: {
					userWorkerUrl: {
						protocol: userWorkerUrl.protocol,
						hostname: userWorkerUrl.hostname,
						port: userWorkerUrl.port,
					},
					userWorkerInspectorUrl: {
						protocol: userWorkerInspectorUrl.protocol,
						hostname: userWorkerInspectorUrl.hostname,
						port: userWorkerInspectorUrl.port,
						pathname: `/core:user:${getName(data.config)}`,
					},
					userWorkerInnerUrlOverrides: {
						protocol: data.config?.dev?.urlOverrides?.secure
							? "https:"
							: "http:",
						hostname: data.config?.dev?.urlOverrides?.hostname,
					},
					headers: {
						// Passing this signature from Proxy Worker allows the User Worker to trust the request.
						"MF-Proxy-Shared-Secret":
							this.#proxyToUserWorkerAuthenticationSecret,
					},
					liveReload: data.config.dev?.liveReload,
					proxyLogsToController: data.bundle.entry.format === "service-worker",
					internalDurableObjects: internalObjects,
					entrypointAddresses,
				},
			});
		} catch (error) {
			this.emitErrorEvent({
				type: "error",
				reason: "Error reloading local server",
				cause: castErrorCause(error),
				source: "LocalRuntimeController",
				data: undefined,
			});
		}
	}
	onBundleComplete(data: BundleCompleteEvent) {
		const id = ++this.#currentBundleId;
		this.emitReloadStartEvent({
			type: "reloadStart",
			config: data.config,
			bundle: data.bundle,
		});
		void this.#mutex.runWith(() => this.#onBundleComplete(data, id));
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		// Ignored in local runtime
	}

	#teardown = async (): Promise<void> => {
		await this.#mf?.dispose();
		this.#mf = undefined;
	};
	async teardown() {
		return this.#mutex.runWith(this.#teardown);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadStart", data);
	}
	emitReloadCompleteEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
