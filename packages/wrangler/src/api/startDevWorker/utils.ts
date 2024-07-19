import assert from "node:assert";
import { readFile } from "node:fs/promises";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type {
	AsyncHook,
	Binding,
	File,
	Hook,
	HookValues,
	ServiceFetch,
	StartDevWorkerInput,
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

type UnwrapHook<H> = H extends Hook<infer T> ? T : never;
export function unwrapHook<
	H extends AsyncHook<T, Args> | undefined,
	T extends HookValues = UnwrapHook<H>,
	Args extends unknown[] = [],
>(
	hook: H,
	...args: Args
): H extends undefined ? UnwrapHook<H> | undefined : UnwrapHook<H> {
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

export function convertCfWorkerInitBindingstoBindings(
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
				for (const { type: unsafeType, name } of info.bindings ?? []) {
					output[name] = { type: `unsafe_${unsafeType}` };
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

// DO NOT USE!
// StartDevWorkerInput and StartDevWorkerOptions are not generally assignable to each other, but they're assignable _enough_ to make the faking of events work when --x-dev-env is turned off
// Typescript needs some help to figure this out though
export function fakeResolvedInput(
	input: StartDevWorkerInput
): StartDevWorkerOptions {
	return input as StartDevWorkerOptions;
}
