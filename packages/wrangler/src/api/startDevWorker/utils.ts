import assert from "node:assert";
import { readFile } from "node:fs/promises";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type { File, Hook, ServiceFetch, StartDevWorkerOptions } from "./types";

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

export function unwrapHook<T extends string | number | object>(
	hook: Hook<T>
): T | Promise<T>;
export function unwrapHook<T extends string | number | object>(
	hook: Hook<T> | undefined
): T | Promise<T> | undefined;
export function unwrapHook<T extends string | number | object>(hook: Hook<T>) {
	console.log("unwrapping hook", hook.toString());
	return typeof hook === "function" ? hook() : hook;
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

export async function getTextFileContents(file: File<string | Uint8Array>) {
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

export async function convertBindingsToCfWorkerInitBindings(
	inputBindings: StartDevWorkerOptions["bindings"]
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

	for (const [name, binding] of Object.entries(inputBindings ?? {})) {
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

			if (typeof binding.source.path === "string") {
				bindings.text_blobs[name] = binding.source.path;
			} else if ("contents" in binding.source) {
				// TODO(maybe): write file contents to disk and set path
				throw new Error(
					"Cannot provide text_blob contents directly in CfWorkerInitBindings"
				);
			}
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
		} else if (isUnsafeBindingType(binding.type)) {
			bindings.unsafe ??= {
				bindings: [],
				metadata: undefined,
				capnp: undefined,
			};
			bindings.unsafe.bindings?.push({
				type: binding.type.slice("unsafe_".length),
				name: name,
			});
		}
	}

	return { bindings, fetchers };
}

function isUnsafeBindingType(type: string): type is `unsafe_${string}` {
	return type.startsWith("unsafe_");
}
