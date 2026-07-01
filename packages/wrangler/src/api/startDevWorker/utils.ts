import assert from "node:assert";
import { readFile } from "node:fs/promises";
import type {
	Binding,
	File,
	Hook,
	HookValues,
	StartDevWorkerOptions,
} from "./types";
import type { WorkerMetadataBinding } from "@cloudflare/workers-utils";

export function assertNever(_value: never) {}

/**
 * When to proactively refresh the preview token.
 *
 * Preview tokens expire after 1 hour (hardcoded in the Workers control plane), so we retry after 50 mins.
 */
export const PREVIEW_TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

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
			case "ai_search_namespace": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "ai_search_namespace" }
				>;
				output[name] = {
					type: "ai_search_namespace",
					namespace: b.namespace,
				};
				break;
			}
			case "ai_search": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "ai_search" }
				>;
				output[name] = {
					type: "ai_search",
					instance_name: b.instance_name,
				};
				break;
			}
			case "agent_memory": {
				const b = binding as Extract<
					WorkerMetadataBinding,
					{ type: "agent_memory" }
				>;
				output[name] = {
					type: "agent_memory",
					namespace: b.namespace,
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
				output[name] = {
					type: "pipeline",
					stream: b.stream,
					pipeline: b.pipeline,
				};
				break;
			}
			case "browser":
			case "ai":
			case "images":
			case "stream":
			case "version_metadata":
			case "media":
			case "websearch":
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
