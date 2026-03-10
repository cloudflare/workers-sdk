import assert from "node:assert";
import { readFile } from "node:fs/promises";
import type { AdditionalDevProps } from "../../dev";
import type {
	Binding,
	File,
	Hook,
	HookValues,
	StartDevWorkerOptions,
} from "./types";
import type {
	Config,
	ConfigBindingFieldName,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

export function assertNever(_value: never) {}

export type MaybePromise<T> = T | Promise<T>;
export type DeferredPromise<T> = {
	promise: Promise<T>;
	resolve: (_: MaybePromise<T>) => void;
	reject: (_: Error) => void;
};

export function createDeferred<T>(
	previousDeferred?: DeferredPromise<T>
): DeferredPromise<T> {
	let resolve, reject;
	const newPromise = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});
	assert(resolve);
	assert(reject);

	// if passed a previousDeferred, ensure it is resolved with the newDeferred
	// so that await-ers of previousDeferred are now await-ing newDeferred
	previousDeferred?.resolve(newPromise);

	return {
		promise: newPromise,
		resolve,
		reject,
	};
}

export function urlFromParts(
	parts: Partial<URL>,
	base = "http://localhost"
): URL {
	const url = new URL(base);

	Object.assign(url, parts);

	return url;
}

type UnwrapHook<
	T extends HookValues | Promise<HookValues>,
	Args extends unknown[],
> = Hook<T, Args>;

export function unwrapHook<
	T extends HookValues | Promise<HookValues>,
	Args extends unknown[],
>(hook: UnwrapHook<T, Args>, ...args: Args): T {
	return typeof hook === "function" ? hook(...args) : hook;
}

export async function getBinaryFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (file.contents instanceof Buffer) {
			return file.contents;
		}
		return Buffer.from(file.contents);
	}
	return readFile(file.path);
}

export function convertConfigBindingsToStartWorkerBindings(
	configBindings: Partial<Pick<Config, ConfigBindingFieldName>>
): StartDevWorkerOptions["bindings"] {
	return convertConfigToBindings(configBindings, {
		usePreviewIds: true,
	});
}

interface ConvertBindingsOptions {
	/**
	 * Use preview IDs (preview_id, preview_bucket_name, preview_database_id) instead of production IDs when resolving a binding ID.
	 * This means that the rest of Wrangler does not need to be aware of preview IDs, and can just use regular IDs.
	 */
	usePreviewIds?: boolean;
	/**
	 * Exclude bindings that Pages doesn't support
	 */
	pages?: boolean;
}

/**
 * Convert Config to the StartDevWorkerInput["bindings"] format for consistent internal use.
 */
export function convertConfigToBindings(
	config: Partial<Pick<Config, ConfigBindingFieldName>>,
	options?: ConvertBindingsOptions
): NonNullable<StartDevWorkerOptions["bindings"]> {
	const { usePreviewIds = false, pages = false } = options ?? {};
	const output: NonNullable<StartDevWorkerOptions["bindings"]> = {};

	type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T][];
	type ConfigIterable = Entries<Required<Pick<Config, ConfigBindingFieldName>>>;
	const configIterable = Object.entries(config) as ConfigIterable;

	for (const [type, info] of configIterable) {
		if (info === undefined) {
			continue;
		}

		switch (type) {
			case "vars": {
				for (const [key, value] of Object.entries(info)) {
					if (typeof value === "string") {
						output[key] = { type: "plain_text", value };
					} else {
						output[key] = { type: "json", value };
					}
				}
				break;
			}
			case "kv_namespaces": {
				for (const { binding, ...x } of info) {
					output[binding] = {
						type: "kv_namespace",
						...x,
						id: usePreviewIds ? x.preview_id ?? x.id : x.id,
					};
				}
				break;
			}
			case "send_email": {
				if (pages) {
					break;
				}
				for (const { name, ...x } of info) {
					output[name] = { type: "send_email", ...x };
				}
				break;
			}
			case "wasm_modules": {
				if (pages) {
					break;
				}
				for (const [key, value] of Object.entries(info)) {
					if (typeof value === "string") {
						output[key] = { type: "wasm_module", source: { path: value } };
					} else {
						output[key] = { type: "wasm_module", source: { contents: value } };
					}
				}
				break;
			}
			case "text_blobs": {
				if (pages) {
					break;
				}
				for (const [key, value] of Object.entries(info)) {
					output[key] = { type: "text_blob", source: { path: value } };
				}
				break;
			}
			case "data_blobs": {
				if (pages) {
					break;
				}
				for (const [key, value] of Object.entries(info)) {
					if (typeof value === "string") {
						output[key] = { type: "data_blob", source: { path: value } };
					} else {
						output[key] = { type: "data_blob", source: { contents: value } };
					}
				}
				break;
			}
			case "browser": {
				const { binding, ...x } = info;
				output[binding] = { type: "browser", ...x };
				break;
			}
			case "durable_objects": {
				for (const { name, ...x } of info.bindings ?? []) {
					output[name] = { type: "durable_object_namespace", ...x };
				}
				break;
			}
			case "workflows": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "workflow", ...x };
				}
				break;
			}
			case "queues": {
				for (const { binding, ...x } of info.producers ?? []) {
					output[binding] = {
						type: "queue",
						queue_name: x.queue,
						...x,
					};
				}
				break;
			}
			case "r2_buckets": {
				for (const { binding, ...x } of info) {
					output[binding] = {
						type: "r2_bucket",
						...x,
						bucket_name: usePreviewIds
							? x.preview_bucket_name ?? x.bucket_name
							: x.bucket_name,
					};
				}
				break;
			}
			case "d1_databases": {
				for (const { binding, ...x } of info) {
					output[binding] = {
						type: "d1",
						...x,
						database_id: usePreviewIds
							? x.preview_database_id ?? x.database_id
							: x.database_id,
					};
				}
				break;
			}
			case "services": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "service", ...x };
				}
				break;
			}
			case "analytics_engine_datasets": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "analytics_engine", ...x };
				}
				break;
			}
			case "dispatch_namespaces": {
				if (pages) {
					break;
				}
				for (const { binding, ...x } of info) {
					output[binding] = { type: "dispatch_namespace", ...x };
				}
				break;
			}
			case "mtls_certificates": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "mtls_certificate", ...x };
				}
				break;
			}
			case "logfwdr": {
				if (pages) {
					break;
				}
				for (const { name, ...x } of info.bindings ?? []) {
					output[name] = { type: "logfwdr", ...x };
				}
				break;
			}
			case "ai": {
				const { binding, ...x } = info;
				output[binding] = { type: "ai", ...x };
				break;
			}
			case "images": {
				const { binding, ...x } = info;
				output[binding] = { type: "images", ...x };
				break;
			}
			case "version_metadata": {
				const { binding, ...x } = info;
				output[binding] = { type: "version_metadata", ...x };
				break;
			}
			case "hyperdrive": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "hyperdrive", ...x };
				}
				break;
			}
			case "vectorize": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "vectorize", ...x };
				}
				break;
			}
			case "unsafe": {
				if (pages) {
					break;
				}
				for (const { type: unsafeType, name, ...data } of info.bindings ?? []) {
					output[name] = { type: `unsafe_${unsafeType}`, ...data };
				}
				break;
			}
			case "assets": {
				if (pages) {
					break;
				}
				if (info.binding) {
					output[info.binding] = { type: "assets" };
				}
				break;
			}
			case "pipelines": {
				if (pages) {
					break;
				}
				for (const { binding, ...x } of info) {
					output[binding] = { type: "pipeline", ...x };
				}
				break;
			}
			case "secrets_store_secrets": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "secrets_store_secret", ...x };
				}
				break;
			}
			case "unsafe_hello_world": {
				if (pages) {
					break;
				}
				for (const { binding, ...x } of info) {
					output[binding] = { type: "unsafe_hello_world", ...x };
				}
				break;
			}
			case "ratelimits": {
				for (const { name, ...x } of info) {
					output[name] = { type: "ratelimit", ...x };
				}
				break;
			}
			case "worker_loaders": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "worker_loader", ...x };
				}
				break;
			}
			case "vpc_services": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "vpc_service", ...x };
				}
				break;
			}
			case "media": {
				const { binding, ...x } = info;
				output[binding] = { type: "media", ...x };
				break;
			}
			default:
				assertNever(type);
		}
	}

	return output;
}

/**
 * Bindings that can be passed via the StartDevOptions CLI interface.
 */
export type StartDevOptionsBindings = Pick<
	AdditionalDevProps,
	| "vars"
	| "kv"
	| "durableObjects"
	| "services"
	| "r2"
	| "ai"
	| "version_metadata"
	| "d1Databases"
>;

/**
 * Convert StartDevOptions bindings to the flat StartDevWorkerInput["bindings"] format.
 */
export function convertStartDevOptionsToBindings(
	inputBindings: StartDevOptionsBindings
): StartDevWorkerOptions["bindings"] {
	// Map StartDevOptionsBindings field names to Config field names
	const configBindings = {
		vars: inputBindings.vars,
		kv_namespaces: inputBindings.kv,
		durable_objects: inputBindings.durableObjects
			? { bindings: inputBindings.durableObjects }
			: undefined,
		services: inputBindings.services,
		r2_buckets: inputBindings.r2,
		ai: inputBindings.ai,
		version_metadata: inputBindings.version_metadata,
		d1_databases: inputBindings.d1Databases,
	};

	return convertConfigToBindings(configBindings, {
		usePreviewIds: true,
	});
}
export function isUnsafeBindingType(type: string): type is `unsafe_${string}` {
	return type.startsWith("unsafe_");
}
/**
 * What configuration key does this binding use for referring to it's binding name?
 */
const nameBindings = [
	"durable_object_namespace",
	"logfwdr",
	"ratelimit",
	"unsafe_ratelimit",
	"send_email",
] as const;
function getBindingKey(type: Binding["type"]) {
	if ((nameBindings as readonly string[]).includes(type)) {
		return "name";
	}
	return "binding";
}

type FlatBinding<Type> = Extract<Binding, { type: Type }> &
	(Type extends (typeof nameBindings)[number]
		? {
				name: string;
			}
		: {
				binding: string;
			});

/**
 * Convert WorkerMetadataBinding[] (API format) to flat bindings format (Record<string, Binding>)
 *
 * WorkerMetadataBinding uses different field names than Binding:
 * - KV: namespace_id -> id
 * - D1: id -> database_id
 * - plain_text/json: text/json -> value
 * - dispatch_namespace: outbound.worker.service -> outbound.service
 */
export function convertWorkerMetadataBindingsToFlatBindings(
	bindings: WorkerMetadataBinding[]
): StartDevWorkerOptions["bindings"] {
	const output: StartDevWorkerOptions["bindings"] = {};

	for (const binding of bindings) {
		const { name, type } = binding;

		switch (type) {
			case "plain_text": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "plain_text" }
				>;
				output[name] = { type: "plain_text", value: b.text };
				break;
			}
			case "secret_text": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "secret_text" }
				>;
				output[name] = { type: "secret_text", value: b.text };
				break;
			}
			case "json": {
				const b = binding as Extract<WorkerMetadataBinding, { type: "json" }>;
				output[name] = { type: "json", value: b.json };
				break;
			}
			case "kv_namespace": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "kv_namespace" }
				>;
				output[name] = { type: "kv_namespace", id: b.namespace_id, raw: b.raw };
				break;
			}
			case "d1": {
				const b = binding as Extract<WorkerMetadataBinding, { type: "d1" }>;
				output[name] = {
					type: "d1",
					database_id: b.id,
					database_internal_env: b.internalEnv,
					raw: b.raw,
				};
				break;
			}
			case "dispatch_namespace": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "dispatch_namespace" }
				>;
				output[name] = {
					type: "dispatch_namespace",
					namespace: b.namespace,
					outbound: b.outbound
						? {
								service: b.outbound.worker.service,
								environment: b.outbound.worker.environment,
								parameters: b.outbound.params?.map((p) => p.name),
							}
						: undefined,
				};
				break;
			}
			case "durable_object_namespace": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "durable_object_namespace" }
				>;
				output[name] = {
					type: "durable_object_namespace",
					class_name: b.class_name,
					script_name: b.script_name,
					environment: b.environment,
				};
				break;
			}
			case "workflow": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "workflow" }
				>;
				output[name] = {
					type: "workflow",
					name: b.workflow_name,
					class_name: b.class_name,
					script_name: b.script_name,
					raw: b.raw,
				};
				break;
			}
			case "queue": {
				const b = binding as Extract<WorkerMetadataBinding, { type: "queue" }>;
				output[name] = {
					type: "queue",
					queue_name: b.queue_name,
					delivery_delay: b.delivery_delay,
					raw: b.raw,
				};
				break;
			}
			case "r2_bucket": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "r2_bucket" }
				>;
				output[name] = {
					type: "r2_bucket",
					bucket_name: b.bucket_name,
					jurisdiction: b.jurisdiction,
					raw: b.raw,
				};
				break;
			}
			case "service": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "service" }
				>;
				output[name] = {
					type: "service",
					service: b.service,
					environment: b.environment,
					entrypoint: b.entrypoint,
					cross_account_grant: b.cross_account_grant,
				};
				break;
			}
			case "analytics_engine": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "analytics_engine" }
				>;
				output[name] = { type: "analytics_engine", dataset: b.dataset };
				break;
			}
			case "vectorize": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "vectorize" }
				>;
				output[name] = {
					type: "vectorize",
					index_name: b.index_name,
					raw: b.raw,
				};
				break;
			}
			case "hyperdrive": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "hyperdrive" }
				>;
				output[name] = { type: "hyperdrive", id: b.id };
				break;
			}
			case "send_email": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "send_email" }
				>;
				// CfSendEmailBindings uses a discriminated union, pass through the relevant fields
				const emailBinding: Record<string, unknown> = { type: "send_email" };
				if ("destination_address" in b && b.destination_address) {
					emailBinding.destination_address = b.destination_address;
				}
				if (
					"allowed_destination_addresses" in b &&
					b.allowed_destination_addresses
				) {
					emailBinding.allowed_destination_addresses =
						b.allowed_destination_addresses;
				}
				if ("allowed_sender_addresses" in b && b.allowed_sender_addresses) {
					emailBinding.allowed_sender_addresses = b.allowed_sender_addresses;
				}
				output[name] = emailBinding as Binding;
				break;
			}
			case "mtls_certificate": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "mtls_certificate" }
				>;
				output[name] = {
					type: "mtls_certificate",
					certificate_id: b.certificate_id,
				};
				break;
			}
			case "pipelines": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "pipelines" }
				>;
				output[name] = { type: "pipeline", pipeline: b.pipeline };
				break;
			}
			case "browser":
			case "ai":
			case "images":
			case "version_metadata":
			case "media":
			case "inherit": {
				// These have the same structure (just type and possibly some flags)
				const { name: _name, ...rest } = binding;
				output[name] = rest as Binding;
				break;
			}
			default: {
				// For any other binding types, pass through as-is
				const { name: _name, ...rest } = binding;
				output[name] = rest as Binding;
			}
		}
	}

	return output;
}

export function extractBindingsOfType<
	Type extends NonNullable<StartDevWorkerOptions["bindings"]>[string]["type"],
>(
	type: Type,
	bindings: StartDevWorkerOptions["bindings"]
): FlatBinding<Type>[] {
	return Object.entries(bindings ?? {})
		.filter(
			(binding): binding is [string, Extract<Binding, { type: Type }>] =>
				binding[1].type === type
		)
		.map((binding) => ({
			...binding[1],
			[getBindingKey(type)]: binding[0],
		})) as FlatBinding<Type>[];
}
