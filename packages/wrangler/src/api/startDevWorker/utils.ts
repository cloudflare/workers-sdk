import assert from "node:assert";
import { readFile } from "node:fs/promises";
import type { ConfigBindingOptions } from "../../config";
import type { WorkerMetadataBinding } from "../../deployment-bundle/create-worker-upload-form";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type {
	Binding,
	File,
	Hook,
	HookValues,
	ServiceFetch,
	StartDevWorkerOptions,
} from "./types";

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

export function assertNever(_value: never) {}

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

async function getBinaryFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (file.contents instanceof Buffer) {
			return file.contents;
		}
		return Buffer.from(file.contents);
	}
	return readFile(file.path);
}

export function convertConfigBindingsToStartWorkerBindings(
	configBindings: ConfigBindingOptions
): StartDevWorkerOptions["bindings"] {
	const { queues, ...bindings } = configBindings;

	return convertCfWorkerInitBindingsToBindings({
		...bindings,
		queues: queues.producers?.map((q) => ({ ...q, queue_name: q.queue })),
	});
}

export function convertCfWorkerInitBindingsToBindings(
	inputBindings: Partial<CfWorkerInit["bindings"]>
): StartDevWorkerOptions["bindings"] {
	const output: StartDevWorkerOptions["bindings"] = {};

	// required to retain type information
	type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T][];
	type BindingsIterable = Entries<Required<typeof inputBindings>>;
	const bindingsIterable = Object.entries(inputBindings) as BindingsIterable;

	for (const [type, info] of bindingsIterable) {
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
					output[binding] = { type: "kv_namespace", ...x };
				}
				break;
			}
			case "send_email": {
				for (const { name, ...x } of info) {
					output[name] = { type: "send_email", ...x };
				}
				break;
			}
			case "wasm_modules": {
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
				for (const [key, value] of Object.entries(info)) {
					output[key] = { type: "text_blob", source: { path: value } };
				}
				break;
			}
			case "data_blobs": {
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
				for (const { name, ...x } of info.bindings) {
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
				for (const { binding, ...x } of info) {
					output[binding] = { type: "queue", ...x };
				}
				break;
			}
			case "r2_buckets": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "r2_bucket", ...x };
				}
				break;
			}
			case "d1_databases": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "d1", ...x };
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
				for (const { name, ...x } of info.bindings) {
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
				for (const { type: unsafeType, name, ...data } of info.bindings ?? []) {
					output[name] = { type: `unsafe_${unsafeType}`, ...data };
				}
				break;
			}
			case "assets": {
				output[info["binding"]] = { type: "assets" };
				break;
			}
			case "pipelines": {
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
				for (const { binding, ...x } of info) {
					output[binding] = { type: "unsafe_hello_world", ...x };
				}
				break;
			}
			default: {
				assertNever(type);
			}
		}
	}

	return output;
}

/**
 * Convert either StartDevWorkerOptions["bindings"] or WorkerMetadataBinding[] to CfWorkerInit["bindings"]
 * This function is by design temporary, but has lived longer than originally expected.
 * For some context, CfWorkerInit is the in-memory representation of a Worker that Wrangler uses,
 * WorkerMetadataBinding is the representation of bindings that comes from the API, and StartDevWorkerOptions
 * is the "new" in-memory representation of a Worker that's used in Wrangler's dev flow. Over
 * time, all uses of CfWorkerInit should transition to StartDevWorkerOptions, but that's a pretty big refactor.
 * As such, in the meantime we have conversion functions so that different code paths can deal with the format they
 * expect and were written for.
 *
 * WARNING: Using this with WorkerMetadataBinding[] will lose information about certain
 * binding types (i.e. WASM modules, text blobs, and data blobs). These binding types are deprecated
 * but may still be used by some Workers in the wild.
 */
export async function convertBindingsToCfWorkerInitBindings(
	inputBindings: StartDevWorkerOptions["bindings"] | WorkerMetadataBinding[]
): Promise<{
	bindings: CfWorkerInit["bindings"];
	fetchers: Record<string, ServiceFetch>;
}> {
	const bindings: CfWorkerInit["bindings"] = {
		vars: undefined,
		kv_namespaces: undefined,
		send_email: undefined,
		wasm_modules: undefined,
		text_blobs: undefined,
		browser: undefined,
		ai: undefined,
		images: undefined,
		version_metadata: undefined,
		data_blobs: undefined,
		durable_objects: undefined,
		queues: undefined,
		r2_buckets: undefined,
		workflows: undefined,
		d1_databases: undefined,
		vectorize: undefined,
		hyperdrive: undefined,
		secrets_store_secrets: undefined,
		services: undefined,
		analytics_engine_datasets: undefined,
		dispatch_namespaces: undefined,
		mtls_certificates: undefined,
		logfwdr: undefined,
		unsafe: undefined,
		assets: undefined,
		pipelines: undefined,
		unsafe_hello_world: undefined,
	};

	const fetchers: Record<string, ServiceFetch> = {};

	const iterator: [string, WorkerMetadataBinding | Binding][] = Array.isArray(
		inputBindings
	)
		? inputBindings.map((b) => [b.name, b])
		: Object.entries(inputBindings ?? {});

	for (const [name, binding] of iterator) {
		if (binding.type === "plain_text") {
			bindings.vars ??= {};
			bindings.vars[name] = "value" in binding ? binding.value : binding.text;
		} else if (binding.type === "json") {
			bindings.vars ??= {};
			bindings.vars[name] = "value" in binding ? binding.value : binding.json;
		} else if (binding.type === "kv_namespace") {
			bindings.kv_namespaces ??= [];
			bindings.kv_namespaces.push({ ...binding, binding: name });
		} else if (binding.type === "send_email") {
			bindings.send_email ??= [];
			bindings.send_email.push({ ...binding, name: name });
		} else if (binding.type === "wasm_module") {
			if (!("source" in binding)) {
				continue;
			}
			bindings.wasm_modules ??= {};
			bindings.wasm_modules[name] = await getBinaryFileContents(binding.source);
		} else if (binding.type === "text_blob") {
			if (!("source" in binding)) {
				continue;
			}
			bindings.text_blobs ??= {};

			if (typeof binding.source.path === "string") {
				bindings.text_blobs[name] = binding.source.path;
			} else if ("contents" in binding.source) {
				// TODO(maybe): write file contents to disk and set path
				throw new Error(
					"Cannot provide text_blob contents directly in CfWorkerInitBindings"
				);
			}
		} else if (binding.type === "data_blob") {
			if (!("source" in binding)) {
				continue;
			}
			bindings.data_blobs ??= {};
			bindings.data_blobs[name] = await getBinaryFileContents(binding.source);
		} else if (binding.type === "browser") {
			bindings.browser = { ...binding, binding: name };
		} else if (binding.type === "ai") {
			bindings.ai = { ...binding, binding: name };
		} else if (binding.type === "images") {
			bindings.images = { ...binding, binding: name };
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
			bindings.dispatch_namespaces.push({
				...binding,
				binding: name,
				outbound:
					binding.outbound && "worker" in binding.outbound
						? undefined
						: binding.outbound,
			});
		} else if (binding.type === "mtls_certificate") {
			bindings.mtls_certificates ??= [];
			bindings.mtls_certificates.push({ ...binding, binding: name });
		} else if (binding.type === "pipeline") {
			bindings.pipelines ??= [];
			bindings.pipelines.push({ ...binding, binding: name });
		} else if (binding.type === "logfwdr") {
			bindings.logfwdr ??= { bindings: [] };
			bindings.logfwdr.bindings.push({ ...binding, name: name });
		} else if (binding.type === "workflow") {
			bindings.workflows ??= [];
			bindings.workflows.push({ ...binding, binding: name });
		} else if (binding.type === "secrets_store_secret") {
			bindings.secrets_store_secrets ??= [];
			bindings.secrets_store_secrets.push({ ...binding, binding: name });
		} else if (binding.type === "unsafe_hello_world") {
			bindings.unsafe_hello_world ??= [];
			bindings.unsafe_hello_world.push({ ...binding, binding: name });
		} else if (isUnsafeBindingType(binding.type)) {
			bindings.unsafe ??= {
				bindings: [],
				metadata: undefined,
				capnp: undefined,
			};

			const { type, ...data } = binding;
			bindings.unsafe.bindings?.push({
				type: type.slice("unsafe_".length),
				name: name,
				...data,
			});
		}
	}

	return { bindings, fetchers };
}

function isUnsafeBindingType(type: string): type is `unsafe_${string}` {
	return type.startsWith("unsafe_");
}

export function extractBindingsOfType<
	Type extends NonNullable<StartDevWorkerOptions["bindings"]>[string]["type"],
>(
	type: Type,
	bindings: StartDevWorkerOptions["bindings"]
): (Extract<Binding, { type: Type }> & {
	binding: string;
	/* ugh why durable objects :( */ name: string;
})[] {
	return Object.entries(bindings ?? {})
		.filter(
			(binding): binding is [string, Extract<Binding, { type: Type }>] =>
				binding[1].type === type
		)
		.map((binding) => ({
			...binding[1],
			binding: binding[0],
			name: binding[0],
		})) as (Extract<Binding, { type: Type }> & {
		binding: string;
		/* ugh why durable objects :( */ name: string;
	})[];
}
