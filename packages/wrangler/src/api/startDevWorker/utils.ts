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
	return typeof hook === "function" ? hook() : hook;
}

export class MissingConfigError extends Error {
	constructor(key: string) {
		super(`Missing config value for ${key}`);
	}
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
		vars: {},
		kv_namespaces: [],
		send_email: [],
		wasm_modules: {},
		text_blobs: {},
		browser: undefined,
		data_blobs: {},
		durable_objects: { bindings: [] },
		queues: [],
		r2_buckets: [],
		d1_databases: [],
		constellation: [],
		services: [],
		analytics_engine_datasets: [],
		dispatch_namespaces: [],
		mtls_certificates: [],
		logfwdr: { bindings: [] },
		unsafe: { bindings: [], metadata: undefined, capnp: undefined },
		ai: undefined,
		version_metadata: undefined,
		hyperdrive: [],
		vectorize: [],
	};
	const fetchers: Record<string, ServiceFetch> = {};

	// TODO: handle all binding types
	for (const [binding, info] of Object.entries(inputBindings ?? {})) {
		switch (info.type) {
			case "plain_text": {
				bindings.vars ??= {};
				bindings.vars[binding] = info.value;
				break;
			}
			case "json": {
				bindings.vars ??= {};
				bindings.vars[binding] = info.value;
				break;
			}
			case "kv_namespace": {
				bindings.kv_namespaces ??= [];
				bindings.kv_namespaces.push({ ...info, binding });
				break;
			}
			case "send_email": {
				bindings.send_email ??= [];
				bindings.send_email.push({ ...info, name: binding });
				break;
			}
			case "wasm_module": {
				bindings.wasm_modules ??= {};
				bindings.wasm_modules[binding] = await getBinaryFileContents(
					info.source
				);
				// bindings.wasm_module[binding] string is path, Uint8Array is contents
				// TODO: do we need to read the file here? just set the path with info.source
				break;
			}
			case "text_blob": {
				bindings.text_blobs ??= {};
				// text_blobs only take path

				if (typeof info.source.path === "string") {
					bindings.text_blobs[binding] = info.source.path;
				} else if ("contents" in info.source) {
					// TODO(maybe): write file contents to disk and set path
					throw new Error(
						"Cannot provide text_blob contents directly in CfWorkerInitBindings"
					);
				}

				break;
			}
			case "data_blob": {
				bindings.data_blobs ??= {};
				bindings.data_blobs[binding] = await getBinaryFileContents(info.source);
				// bindings.data_blobs[binding] string is path, Uint8Array is contents
				// TODO: do we need to read the file here? just set the path with info.source
				break;
			}
			case "browser": {
				bindings.browser = { binding };
				break;
			}
			case "ai": {
				bindings.ai = { binding };
				break;
			}
			case "version_metadata": {
				bindings.version_metadata = { binding };
				break;
			}
			case "durable_object_namespace": {
				bindings.durable_objects ??= { bindings: [] };
				bindings.durable_objects.bindings.push({ ...info, name: binding });
				break;
			}
			case "queue": {
				bindings.queues ??= [];
				bindings.queues.push({ ...info, binding });
				break;
			}
			case "r2_bucket": {
				bindings.r2_buckets ??= [];
				bindings.r2_buckets.push({ ...info, binding });
				break;
			}
			case "d1": {
				bindings.d1_databases ??= [];
				bindings.d1_databases.push({ ...info, binding });
				break;
			}
			case "vectorize": {
				bindings.vectorize ??= [];
				bindings.vectorize.push({ ...info, binding });
				break;
			}
			case "constellation": {
				bindings.constellation ??= [];
				bindings.constellation.push({ ...info, binding });
				break;
			}
			case "hyperdrive": {
				bindings.hyperdrive ??= [];
				bindings.hyperdrive.push({ ...info, binding });
				break;
			}
			case "service": {
				bindings.services ??= [];
				bindings.services.push({ ...info, binding });
				break;
			}
			case "fetcher": {
				fetchers[binding] = info.fetcher;
				break;
			}
			case "analytics_engine": {
				bindings.analytics_engine_datasets ??= [];
				bindings.analytics_engine_datasets.push({ ...info, binding });
				break;
			}
			case "dispatch_namespace": {
				bindings.dispatch_namespaces ??= [];
				bindings.dispatch_namespaces.push({ ...info, binding });
				break;
			}
			case "mtls_certificate": {
				bindings.mtls_certificates ??= [];
				bindings.mtls_certificates.push({ ...info, binding });
				break;
			}
			case "logfwdr": {
				bindings.logfwdr ??= { bindings: [] };
				bindings.logfwdr.bindings.push({ ...info, name: binding });
				break;
			}
			default: {
				if (isUnsafeBindingType(info.type)) {
					bindings.unsafe ??= {
						bindings: [],
						metadata: undefined,
						capnp: undefined,
					};
					bindings.unsafe.bindings?.push({ ...info, name: binding });
					break;
				}

				assertNever(info.type);
			}
		}
	}

	return { bindings, fetchers };
}

function isUnsafeBindingType(type: string): type is `unsafe_${string}` {
	return type.startsWith("unsafe_");
}

export function convertCfWorkerInitBindingsToBindings(
	inputBindings: CfWorkerInit["bindings"]
): StartDevWorkerOptions["bindings"] {
	const output: StartDevWorkerOptions["bindings"] = {};

	// required to retain type information
	type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T][];
	type BindingsIterable = Entries<typeof inputBindings>;
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
			case "constellation": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "constellation", ...x };
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
				for (const { type, name } of info.bindings ?? []) {
					output[name] = { type: `unsafe_${type}` };
				}
				// TODO: consider info.metadata + info.capnp
				break;
			}
			default: {
				assertNever(type);
			}
		}

		return output;
	}
}
