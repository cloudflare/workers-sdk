import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	clearTimeout as clearNodeTimeout,
	setTimeout as setNodeTimeout,
} from "node:timers";
import { gzipSync } from "node:zlib";
import { UserError } from "@cloudflare/workers-utils";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { Response } from "undici";
import { WebSocket } from "ws";
import { fromMimeType } from "./deploy/helpers/create-worker-upload-form";
import type {
	CfModuleType,
	Json,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";
import type { Protocol } from "devtools-protocol";
import type { V4ModuleDefinition, V4WorkerOptionsShape } from "miniflare";
import type { FormData, FormDataEntryValue } from "undici";
import type { RawData } from "ws";

const STARTUP_PROFILE_TIMEOUT_MS = 10_000;

const MODULE_TYPE_TO_MINIFLARE_TYPE: Record<
	CfModuleType,
	V4ModuleDefinition["type"]
> = {
	esm: "ESModule",
	commonjs: "CommonJS",
	"compiled-wasm": "CompiledWasm",
	buffer: "Data",
	text: "Text",
	python: "PythonModule",
	"python-requirement": "PythonRequirement",
};

export interface StartupProfileSummary {
	profileWindow: number;
	sampledTime: number;
	activeTime: number;
	garbageCollectionTime: number;
	idleTime: number;
	sampleCount: number;
}

/**
 * Parses a multipart Worker upload from disk, or returns an existing upload.
 *
 * @param workerBundle - A serialized upload path or an already parsed upload.
 * @returns The parsed multipart Worker upload.
 */
export async function parseWorkerBundle(
	workerBundle: string | FormData
): Promise<FormData> {
	if (typeof workerBundle !== "string") {
		return workerBundle;
	}

	const bundle = await readFile(workerBundle);
	const firstLine = bundle.findIndex((value) => value === 10);
	const boundary = Uint8Array.prototype.slice
		.call(bundle, 2, firstLine)
		.toString();
	const response = new Response(bundle, {
		headers: {
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
		},
	});
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- formData() is the standard Web API; only deprecated on undici's server-side types
	return await response.formData();
}

/**
 * Measures the uncompressed and gzip-compressed size of a Worker upload.
 * Source maps and metadata are excluded from both measurements.
 *
 * @param workerBundle - A parsed multipart Worker upload.
 * @returns Raw and compressed byte counts.
 */
export async function getBundleSize(workerBundle: FormData): Promise<{
	size: number;
	gzipSize: number;
}> {
	const modules: Blob[] = [];
	for (const entry of workerBundle.values()) {
		if (entry instanceof Blob && entry.type !== "application/source-map") {
			modules.push(entry);
		}
	}
	const bundle = new Blob(modules);
	return {
		size: bundle.size,
		gzipSize: gzipSync(await bundle.arrayBuffer()).byteLength,
	};
}

/**
 * Summarizes the timing samples in a Worker startup CPU profile.
 *
 * @param profile - A Chrome DevTools Protocol CPU profile.
 * @returns Aggregate startup, active, idle, and garbage-collection timings.
 */
export function summarizeStartupProfile(
	profile: Protocol.Profiler.Profile
): StartupProfileSummary {
	const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
	const samples = profile.samples ?? [];
	const timeDeltas = profile.timeDeltas ?? [];
	let sampledTime = 0;
	let idleTime = 0;
	let garbageCollectionTime = 0;

	for (const [index, timeDelta] of timeDeltas.entries()) {
		sampledTime += timeDelta;
		const functionName = nodes.get(samples[index] ?? 0)?.callFrame.functionName;
		if (functionName === "(idle)") {
			idleTime += timeDelta;
		} else if (functionName === "(garbage collector)") {
			garbageCollectionTime += timeDelta;
		}
	}

	return {
		profileWindow: profile.endTime - profile.startTime,
		sampledTime,
		activeTime: sampledTime - idleTime,
		garbageCollectionTime,
		idleTime,
		sampleCount: samples.length,
	};
}

/**
 * Runs a Worker upload locally and records its module-evaluation CPU profile.
 *
 * @param workerBundle - A serialized upload path or a parsed multipart upload.
 * @returns A Chrome DevTools Protocol CPU profile.
 */
export async function analyseBundle(
	workerBundle: string | FormData
): Promise<Protocol.Profiler.Profile> {
	const parsedWorkerBundle = await parseWorkerBundle(workerBundle);
	const metadata = JSON.parse(
		parsedWorkerBundle.get("metadata") as string
	) as Record<string, unknown>;

	if (typeof metadata.main_module !== "string") {
		throw new UserError(
			"Startup profiling does not support service-worker format Workers. Refer to https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/ for migration guidance.",
			{
				telemetryMessage: "startup profiling service worker format unsupported",
			}
		);
	}
	const convertedBindings = await convertWorkerBundleBindings(
		parsedWorkerBundle,
		metadata.bindings
	);

	const mf = new Miniflare(
		convertV4MiniflareOptions({
			name: "profiler",
			compatibilityDate:
				typeof metadata.compatibility_date === "string"
					? metadata.compatibility_date
					: undefined,
			compatibilityFlags: Array.isArray(metadata.compatibility_flags)
				? (metadata.compatibility_flags as string[])
				: undefined,
			...convertedBindings.options,
			modulesRoot: "/",
			modules: [
				{
					type: "ESModule",
					// Keep the profiler entrypoint separate from all user module names.
					path: randomUUID(),
					contents: /* javascript */ `
					async function startup() {
						await import(${JSON.stringify(metadata.main_module)});
					}
					export default {
						async fetch() {
							await startup();
							return new Response("ok");
						}
					}
					`,
				},
				...(await convertWorkerBundleToModules(parsedWorkerBundle)),
			],
			inspectorPort: 0,
			handleStructuredLogs: () => undefined,
		})
	);
	const abortController = new AbortController();
	const timeout = setNodeTimeout(() => {
		abortController.abort(
			new UserError(
				`Worker startup profiling timed out after ${STARTUP_PROFILE_TIMEOUT_MS / 1000} seconds.`,
				{ telemetryMessage: "startup profiling timed out" }
			)
		);
	}, STARTUP_PROFILE_TIMEOUT_MS);

	let ws: WebSocket | undefined;
	const onInspectorError = (error: unknown) =>
		abortController.abort(
			error instanceof Error
				? error
				: new Error(`Worker startup profiler inspector error: ${String(error)}`)
		);
	const onInspectorClose = () =>
		abortController.abort(
			new Error("The Worker startup profiler inspector connection closed.")
		);

	try {
		await waitForPromise(mf.ready, abortController.signal);
		const inspectorUrl = await waitForPromise(
			mf.getInspectorURL(),
			abortController.signal
		);
		ws = new WebSocket(new URL("/core:user:profiler", inspectorUrl.href));
		ws.on("error", onInspectorError);
		ws.on("close", onInspectorClose);
		await waitForInspectorOpen(ws, abortController.signal);

		await sendInspectorCommand(
			ws,
			1,
			"Profiler.enable",
			abortController.signal
		);
		await sendInspectorCommand(ws, 2, "Profiler.start", abortController.signal);

		const response = await waitForPromise(
			mf.dispatchFetch("https://example.com", {
				signal: abortController.signal,
			}),
			abortController.signal
		);
		await waitForPromise(response.text(), abortController.signal);
		// A module-evaluation failure is itself useful profile data. Only fail when
		// local binding reconstruction could have caused it.
		if (!response.ok && convertedBindings.unsupportedBindings.length > 0) {
			const unsupportedBindings = ` The upload contains bindings that cannot be reproduced locally during startup profiling: ${convertedBindings.unsupportedBindings
				.map(
					(binding) =>
						`${JSON.stringify(binding.name)} (${JSON.stringify(binding.type)})`
				)
				.join(", ")}.`;
			throw new UserError(
				`Worker startup profiling failed during module evaluation (status ${response.status}).${unsupportedBindings}`,
				{
					telemetryMessage: "startup profiling module evaluation failed",
				}
			);
		}

		const stopResult = await sendInspectorCommand<{
			profile: Protocol.Profiler.Profile;
		}>(ws, 3, "Profiler.stop", abortController.signal);
		if (stopResult?.profile === undefined) {
			throw new Error("Inspector command Profiler.stop returned no profile.");
		}
		return stopResult.profile;
	} finally {
		try {
			await mf.dispose();
		} finally {
			try {
				if (ws !== undefined) {
					ws.off("error", onInspectorError);
					ws.off("close", onInspectorClose);
					if (ws.readyState !== WebSocket.CLOSED) {
						// Miniflare normally closes its inspector clients during disposal.
						// Terminate as a fallback if setup or disposal failed early.
						ws.once("error", () => undefined);
						ws.terminate();
					}
				}
			} finally {
				clearNodeTimeout(timeout);
			}
		}
	}
}

type MiniflareBindingOptions = Pick<
	V4WorkerOptionsShape,
	| "agentMemory"
	| "ai"
	| "aiSearchInstances"
	| "aiSearchNamespaces"
	| "analyticsEngineDatasets"
	| "artifacts"
	| "bindings"
	| "browserRendering"
	| "dataBlobBindings"
	| "d1Databases"
	| "dispatchNamespaces"
	| "email"
	| "flagship"
	| "helloWorld"
	| "images"
	| "kvNamespaces"
	| "media"
	| "mtlsCertificates"
	| "pipelines"
	| "queueProducers"
	| "r2Buckets"
	| "ratelimits"
	| "secretsStoreSecrets"
	| "serviceBindings"
	| "stream"
	| "vectorize"
	| "versionMetadata"
	| "vpcNetworks"
	| "vpcServices"
	| "websearch"
	| "workerLoaders"
>;

type MiniflareBindingOption<Name extends keyof V4WorkerOptionsShape> =
	NonNullable<V4WorkerOptionsShape[Name]>;

interface UnsupportedWorkerBinding {
	name: string;
	type: string;
}

interface ConvertedWorkerBundleBindings {
	options: MiniflareBindingOptions;
	unsupportedBindings: UnsupportedWorkerBinding[];
}

async function convertWorkerBundleBindings(
	workerBundle: FormData,
	bindings: unknown
): Promise<ConvertedWorkerBundleBindings> {
	const agentMemory: MiniflareBindingOption<"agentMemory"> = {};
	let ai: MiniflareBindingOption<"ai"> | undefined;
	const aiSearchInstances: MiniflareBindingOption<"aiSearchInstances"> = {};
	const aiSearchNamespaces: MiniflareBindingOption<"aiSearchNamespaces"> = {};
	const analyticsEngineDatasets: MiniflareBindingOption<"analyticsEngineDatasets"> =
		{};
	const artifacts: MiniflareBindingOption<"artifacts"> = {};
	const miniflareBindings: Record<string, Json> = {};
	let browserRendering: MiniflareBindingOption<"browserRendering"> | undefined;
	const dataBlobBindings: Record<string, Uint8Array> = {};
	const d1Databases: Record<string, { id: string }> = {};
	const dispatchNamespaces: MiniflareBindingOption<"dispatchNamespaces"> = {};
	const sendEmailBindings: NonNullable<
		MiniflareBindingOption<"email">["send_email"]
	> = [];
	const flagship: MiniflareBindingOption<"flagship"> = {};
	const helloWorld: MiniflareBindingOption<"helloWorld"> = {};
	let images: MiniflareBindingOption<"images"> | undefined;
	const kvNamespaces: Record<string, { id: string }> = {};
	let media: MiniflareBindingOption<"media"> | undefined;
	const mtlsCertificates: MiniflareBindingOption<"mtlsCertificates"> = {};
	const pipelines: Record<string, { stream: string } | { pipeline: string }> =
		{};
	const queueProducers: Record<
		string,
		{ queueName: string; deliveryDelay?: number }
	> = {};
	const r2Buckets: Record<string, { id: string }> = {};
	const ratelimits: MiniflareBindingOption<"ratelimits"> = {};
	const secretsStoreSecrets: MiniflareBindingOption<"secretsStoreSecrets"> = {};
	const serviceBindings: NonNullable<V4WorkerOptionsShape["serviceBindings"]> =
		{};
	let stream: MiniflareBindingOption<"stream"> | undefined;
	const vectorize: MiniflareBindingOption<"vectorize"> = {};
	let versionMetadata: string | undefined;
	const vpcNetworks: MiniflareBindingOption<"vpcNetworks"> = {};
	const vpcServices: MiniflareBindingOption<"vpcServices"> = {};
	const websearch: MiniflareBindingOption<"websearch"> = {};
	const workerLoaders: MiniflareBindingOption<"workerLoaders"> = {};
	const unsupportedBindings: UnsupportedWorkerBinding[] = [];

	for (const value of Array.isArray(bindings) ? bindings : []) {
		if (!isNamedWorkerBinding(value)) {
			unsupportedBindings.push({ name: "<unknown>", type: "unknown" });
			continue;
		}
		const binding = value as WorkerMetadataBinding;
		// Raw resource bindings expose a Fetcher instead of their product API.
		if (isRawWorkerBinding(binding)) {
			serviceBindings[binding.name] = createOfflineFetcherBinding();
			continue;
		}
		switch (binding.type) {
			case "plain_text":
			case "secret_text":
				miniflareBindings[binding.name] = binding.text;
				break;
			case "json":
				miniflareBindings[binding.name] = binding.json;
				break;
			case "text_blob":
				miniflareBindings[binding.name] = await getTextBindingPart(
					workerBundle,
					binding
				);
				break;
			case "data_blob":
				dataBlobBindings[binding.name] = await getBinaryBindingPart(
					workerBundle,
					binding
				);
				break;
			case "kv_namespace":
				kvNamespaces[binding.name] = { id: binding.namespace_id };
				break;
			case "d1":
				d1Databases[binding.name] = { id: binding.id };
				break;
			case "r2_bucket":
				r2Buckets[binding.name] = { id: binding.bucket_name };
				break;
			case "queue":
				queueProducers[binding.name] = {
					queueName: binding.queue_name,
					deliveryDelay: binding.delivery_delay,
				};
				break;
			case "service":
				serviceBindings[binding.name] = createOfflineFetcherBinding();
				unsupportedBindings.push(binding);
				break;
			case "assets":
				serviceBindings[binding.name] = createOfflineFetcherBinding();
				break;
			case "browser":
				browserRendering = { binding: binding.name };
				break;
			case "ai":
				ai = { binding: binding.name };
				break;
			case "images":
				images = { binding: binding.name };
				break;
			case "stream":
				stream = { binding: binding.name };
				break;
			case "version_metadata":
				versionMetadata = binding.name;
				break;
			case "ai_search_namespace":
				aiSearchNamespaces[binding.name] = {
					namespace: binding.namespace,
				};
				break;
			case "ai_search":
				aiSearchInstances[binding.name] = {
					instance_name: binding.instance_name,
				};
				break;
			case "websearch":
				websearch[binding.name] = {};
				break;
			case "agent_memory":
				agentMemory[binding.name] = { namespace: binding.namespace };
				break;
			case "media":
				media = { binding: binding.name };
				break;
			case "send_email": {
				const shared = {
					name: binding.name,
					allowed_sender_addresses: binding.allowed_sender_addresses,
				};
				if (binding.destination_address !== undefined) {
					sendEmailBindings.push({
						...shared,
						destination_address: binding.destination_address,
					});
				} else if (binding.allowed_destination_addresses !== undefined) {
					sendEmailBindings.push({
						...shared,
						allowed_destination_addresses:
							binding.allowed_destination_addresses,
					});
				} else {
					sendEmailBindings.push(shared);
				}
				break;
			}
			case "durable_object_namespace":
			case "workflow":
				// The profiler wrapper deliberately imports the user module only after
				// profiling starts, so it cannot expose its class entrypoints up front.
				unsupportedBindings.push(binding);
				break;
			case "vectorize":
				vectorize[binding.name] = { index_name: binding.index_name };
				break;
			case "analytics_engine":
				analyticsEngineDatasets[binding.name] = {
					dataset: binding.dataset ?? "dataset",
				};
				break;
			case "dispatch_namespace":
				dispatchNamespaces[binding.name] = {
					namespace: binding.namespace,
				};
				break;
			case "mtls_certificate":
				mtlsCertificates[binding.name] = {
					certificate_id: binding.certificate_id,
				};
				break;
			case "pipelines":
				if (binding.stream !== undefined) {
					pipelines[binding.name] = { stream: binding.stream };
				} else if (binding.pipeline !== undefined) {
					pipelines[binding.name] = { pipeline: binding.pipeline };
				} else {
					unsupportedBindings.push(binding);
				}
				break;
			case "secrets_store_secret":
				secretsStoreSecrets[binding.name] = {
					store_id: binding.store_id,
					secret_name: binding.secret_name,
				};
				break;
			case "artifacts":
				artifacts[binding.name] = { namespace: binding.namespace };
				break;
			case "unsafe_hello_world":
				helloWorld[binding.name] = {
					enable_timer: binding.enable_timer,
				};
				break;
			case "flagship":
				flagship[binding.name] = { app_id: binding.app_id };
				break;
			case "ratelimit":
				ratelimits[binding.name] = {
					namespace_id: binding.namespace_id,
					simple: binding.simple,
				};
				break;
			case "vpc_service":
				vpcServices[binding.name] = { service_id: binding.service_id };
				break;
			case "vpc_network":
				if (binding.tunnel_id !== undefined) {
					vpcNetworks[binding.name] = { tunnel_id: binding.tunnel_id };
				} else if (binding.network_id !== undefined) {
					vpcNetworks[binding.name] = { network_id: binding.network_id };
				} else {
					unsupportedBindings.push(binding);
				}
				break;
			case "worker_loader":
				workerLoaders[binding.name] = {};
				break;
			case "inherit":
				// Inheritance erases the original binding type from upload metadata.
				unsupportedBindings.push(binding);
				break;
			case "wasm_module":
				// workerd rejects Wasm env bindings for the module Workers profiled here.
				unsupportedBindings.push(binding);
				break;
			case "hyperdrive":
				// Upload metadata has an id, but local Hyperdrive needs a database URL.
				unsupportedBindings.push(binding);
				break;
			case "logfwdr":
				// Miniflare has no runtime binding option for log forwarders.
				unsupportedBindings.push(binding);
				break;
			default: {
				binding satisfies never;
				const unknownBinding = binding as unknown as UnsupportedWorkerBinding;
				unsupportedBindings.push(unknownBinding);
			}
		}
	}

	return {
		options: {
			agentMemory,
			ai,
			aiSearchInstances,
			aiSearchNamespaces,
			analyticsEngineDatasets,
			artifacts,
			bindings: miniflareBindings,
			browserRendering,
			dataBlobBindings,
			d1Databases,
			dispatchNamespaces,
			email: { send_email: sendEmailBindings },
			flagship,
			helloWorld,
			images,
			kvNamespaces,
			media,
			mtlsCertificates,
			pipelines,
			queueProducers,
			r2Buckets,
			ratelimits,
			secretsStoreSecrets,
			serviceBindings,
			stream,
			vectorize,
			versionMetadata,
			vpcNetworks,
			vpcServices,
			websearch,
			workerLoaders,
		},
		unsupportedBindings,
	};
}

function isRawWorkerBinding(binding: WorkerMetadataBinding): boolean {
	switch (binding.type) {
		case "browser":
		case "ai":
		case "images":
		case "kv_namespace":
		case "workflow":
		case "queue":
		case "r2_bucket":
		case "d1":
		case "vectorize":
			return binding.raw === true;
		default:
			return false;
	}
}

function isNamedWorkerBinding(
	value: unknown
): value is UnsupportedWorkerBinding {
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		typeof value.name === "string" &&
		"type" in value &&
		typeof value.type === "string"
	);
}

function createOfflineFetcherBinding(): () => Response {
	return () =>
		new Response("Binding calls are unavailable during startup profiling.", {
			status: 503,
		});
}

async function getBinaryBindingPart(
	workerBundle: FormData,
	binding: Extract<WorkerMetadataBinding, { type: "data_blob" }>
): Promise<Uint8Array> {
	const part = getBindingPart(workerBundle, binding);
	return part instanceof Blob
		? new Uint8Array((await part.arrayBuffer()) as ArrayBuffer)
		: new TextEncoder().encode(part);
}

async function getTextBindingPart(
	workerBundle: FormData,
	binding: Extract<WorkerMetadataBinding, { type: "text_blob" }>
): Promise<string> {
	const part = getBindingPart(workerBundle, binding);
	return part instanceof Blob ? await part.text() : part;
}

function getBindingPart(
	workerBundle: FormData,
	binding: Extract<WorkerMetadataBinding, { type: "text_blob" | "data_blob" }>
): FormDataEntryValue {
	const part = workerBundle.get(binding.part);
	if (part === null) {
		throw new UserError(
			`Startup profiling could not find multipart part ${JSON.stringify(binding.part)} for binding ${JSON.stringify(binding.name)}.`,
			{ telemetryMessage: "startup profiling binding part missing" }
		);
	}
	return part;
}

async function waitForPromise<T>(
	promise: Promise<T>,
	signal: AbortSignal
): Promise<T> {
	if (signal.aborted) {
		throw signal.reason;
	}

	return await new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		void promise.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", onAbort);
		});
	});
}

async function waitForInspectorOpen(
	ws: WebSocket,
	signal: AbortSignal
): Promise<void> {
	if (signal.aborted) {
		throw signal.reason;
	}

	return await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			ws.off("open", onOpen);
			ws.off("error", onError);
			ws.off("close", onClose);
			signal.removeEventListener("abort", onAbort);
		};
		const onOpen = () => {
			cleanup();
			resolve();
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const onClose = () => {
			cleanup();
			reject(
				new Error("The Worker startup profiler inspector connection closed.")
			);
		};
		const onAbort = () => {
			cleanup();
			reject(signal.reason);
		};

		ws.once("open", onOpen);
		ws.once("error", onError);
		ws.once("close", onClose);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

async function sendInspectorCommand<Result>(
	ws: WebSocket,
	id: number,
	method: string,
	signal: AbortSignal
): Promise<Result> {
	if (signal.aborted) {
		throw signal.reason;
	}

	return await new Promise<Result>((resolve, reject) => {
		const cleanup = () => {
			ws.off("message", onMessage);
			signal.removeEventListener("abort", onAbort);
		};
		const onMessage = (rawData: RawData) => {
			let message: {
				id?: number;
				result?: Result;
				error?: { code?: number; message?: string } | null;
			};
			try {
				message = JSON.parse(rawData.toString()) as typeof message;
			} catch (error) {
				cleanup();
				reject(error);
				return;
			}

			if (message.id !== id) {
				return;
			}

			cleanup();
			if (message.error != null) {
				reject(
					new Error(
						`Inspector command ${method} failed: ${message.error.message ?? `error ${message.error.code ?? "unknown"}`}`
					)
				);
				return;
			}
			resolve(message.result as Result);
		};
		const onAbort = () => {
			cleanup();
			reject(signal.reason);
		};

		ws.on("message", onMessage);
		signal.addEventListener("abort", onAbort, { once: true });
		try {
			ws.send(JSON.stringify({ id, method, params: {} }), (error) => {
				if (error) {
					cleanup();
					reject(error);
				}
			});
		} catch (error) {
			cleanup();
			reject(error);
		}
	});
}

async function getEntryValue(
	entry: FormDataEntryValue
): Promise<Uint8Array | string> {
	if (entry instanceof Blob) {
		return new Uint8Array((await entry.arrayBuffer()) as ArrayBuffer);
	}
	return entry as string;
}

function getModuleType(entry: FormDataEntryValue): V4ModuleDefinition["type"] {
	if (entry instanceof Blob) {
		try {
			return MODULE_TYPE_TO_MINIFLARE_TYPE[fromMimeType(entry.type)];
		} catch {
			throw new Error(
				`Unable to determine module type for ${entry.type} mime type`
			);
		}
	}
	return "Text";
}

async function convertWorkerBundleToModules(
	workerBundle: FormData
): Promise<V4ModuleDefinition[]> {
	return await Promise.all(
		[...workerBundle.entries()]
			// Source maps are upload metadata rather than importable Worker modules.
			.filter(
				(module) =>
					module[1] instanceof Blob &&
					module[1].type !== "application/source-map"
			)
			.map(
				async ([modulePath, entry]) =>
					({
						type: getModuleType(entry),
						path: modulePath,
						contents: await getEntryValue(entry),
					}) as V4ModuleDefinition
			)
	);
}
