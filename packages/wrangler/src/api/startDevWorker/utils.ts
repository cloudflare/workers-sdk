import assert from "node:assert";
import type { CfWorkerInit } from "../../deployment-bundle/worker";
import type { Hook, StartDevWorkerOptions } from "./types";

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

export function coerceBindingsToApiBindings(
	bindings: StartDevWorkerOptions["bindings"]
): CfWorkerInit["bindings"] {
	const result: CfWorkerInit["bindings"] = {
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
		hyperdrive: [],
		vectorize: [],
	};

	// TODO: handle all binding types
	for (const [binding, info] of Object.entries(bindings ?? {})) {
		switch (info.type) {
			case "kv":
				result.kv_namespaces ??= [];
				result.kv_namespaces.push({ binding, id: info.id });
				break;
			case "var":
				result.vars ??= {};
				result.vars[binding] = JSON.stringify(info.value);
				break;
			case "r2":
				result.r2_buckets ??= [];
				result.r2_buckets.push({ binding, bucket_name: info.bucket_name });
				break;
			case "d1":
				break;
			case "ai":
				break;
			case "durable-object":
				break;
			case "queue":
				break;
			case "service":
				break;
			default:
				if (isUnsafeBindingType(info.type)) {
					break;
				}

				assertNever(info.type);
		}
	}

	return result;
}

function isUnsafeBindingType(type: string): type is `unsafe-${string}` {
	return type.startsWith("unsafe-");
}

// function removeBindingTypeAndAddBindingName<T>(
// 	bindingName: string,
// 	binding: T
// ): Omit<T, "type"> {
// 	return binding;
// }
