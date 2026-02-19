import assert from "node:assert";
import { env, exports } from "cloudflare:workers";
import { getSerializedOptions } from "./env";
import type { __VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__ } from "./index";

const CF_KEY_ACTION = "vitestPoolWorkersDurableObjectAction";

let nextActionId = 0;
const kUseResponse = Symbol("kUseResponse");
const actionResults = new Map<number /* id */, unknown>();

function isDurableObjectNamespace(v: unknown): v is DurableObjectNamespace {
	return (
		v instanceof Object &&
		/^(?:Loopback)?DurableObjectNamespace$/.test(v.constructor.name) &&
		"newUniqueId" in v &&
		typeof v.newUniqueId === "function" &&
		"idFromName" in v &&
		typeof v.idFromName === "function" &&
		"idFromString" in v &&
		typeof v.idFromString === "function" &&
		"get" in v &&
		typeof v.get === "function"
	);
}
function isDurableObjectStub(v: unknown): v is DurableObjectStub {
	return (
		typeof v === "object" &&
		v !== null &&
		(v.constructor.name === "DurableObject" ||
			v.constructor.name === "WorkerRpc") &&
		"fetch" in v &&
		typeof v.fetch === "function" &&
		"id" in v &&
		typeof v.id === "object"
	);
}

// Whilst `sameIsolatedNamespaces` depends on `getSerializedOptions()`,
// `durableObjectBindingDesignators` is derived from the user Durable Object
// config. If this were to change, the Miniflare options would change too
// restarting this worker. This means we only need to compute this once, as it
// will automatically invalidate when needed.
let sameIsolatedNamespaces: DurableObjectNamespace[] | undefined;
function getSameIsolateNamespaces(): DurableObjectNamespace[] {
	if (sameIsolatedNamespaces !== undefined) {
		return sameIsolatedNamespaces;
	}
	sameIsolatedNamespaces = [];

	const options = getSerializedOptions();
	if (options.durableObjectBindingDesignators === undefined) {
		return sameIsolatedNamespaces;
	}

	for (const [key, designator] of options.durableObjectBindingDesignators) {
		// We're assuming the user isn't able to guess the current worker name, so
		// if a `scriptName` is set, the designator is for another worker.
		if (designator.scriptName !== undefined) {
			continue;
		}

		const namespace = env[key] ?? (exports as Record<string, unknown>)?.[key];
		assert(
			isDurableObjectNamespace(namespace),
			`Expected ${key} to be a DurableObjectNamespace binding`
		);
		sameIsolatedNamespaces.push(namespace);
	}

	return sameIsolatedNamespaces;
}

function assertSameIsolate(stub: DurableObjectStub) {
	// Make sure our special `cf` requests get handled correctly and aren't
	// routed to user fetch handlers
	const idString = stub.id.toString();
	const namespaces = getSameIsolateNamespaces();
	// Try to recreate the stub's ID using each same-isolate namespace.
	// `idFromString()` will throw if the ID is not for that namespace.
	// If a call succeeds, we know the ID is for an object in this isolate.
	for (const namespace of namespaces) {
		try {
			namespace.idFromString(idString);
			return;
		} catch {}
	}
	// If no calls succeed, we know the ID is for an object outside this isolate,
	// and we won't be able to use the `actionResults` map to share data.
	throw new Error(
		"Durable Object test helpers can only be used with stubs pointing to objects defined within the same worker."
	);
}

async function runInStub<O extends DurableObject, R>(
	stub: Fetcher,
	callback: (instance: O, state: DurableObjectState) => R | Promise<R>
): Promise<R> {
	const id = nextActionId++;
	actionResults.set(id, callback);

	const response = await stub.fetch("http://x", {
		cf: { [CF_KEY_ACTION]: id },
	});

	// `result` may be `undefined`
	assert(actionResults.has(id), `Expected action result for ${id}`);
	const result = actionResults.get(id);
	actionResults.delete(id);

	if (result === kUseResponse) {
		return response as R;
	} else if (response.ok) {
		return result as R;
	} else {
		throw result;
	}
}

// See public facing `cloudflare:test` types for docs
// (`async` so it throws asynchronously/rejects)
export async function runInDurableObject<O extends DurableObject, R>(
	stub: DurableObjectStub,
	callback: (instance: O, state: DurableObjectState) => R | Promise<R>
): Promise<R> {
	if (!isDurableObjectStub(stub)) {
		throw new TypeError(
			"Failed to execute 'runInDurableObject': parameter 1 is not of type 'DurableObjectStub'."
		);
	}
	if (typeof callback !== "function") {
		throw new TypeError(
			"Failed to execute 'runInDurableObject': parameter 2 is not of type 'function'."
		);
	}

	assertSameIsolate(stub);
	return runInStub(stub, callback);
}

async function runAlarm(instance: DurableObject, state: DurableObjectState) {
	const alarm = await state.storage.getAlarm();
	if (alarm === null) {
		return false;
	}
	await state.storage.deleteAlarm();
	await instance.alarm?.();
	return true;
}
// See public facing `cloudflare:test` types for docs
// (`async` so it throws asynchronously/rejects)
export async function runDurableObjectAlarm(
	stub: DurableObjectStub
): Promise<boolean /* ran */> {
	if (!isDurableObjectStub(stub)) {
		throw new TypeError(
			"Failed to execute 'runDurableObjectAlarm': parameter 1 is not of type 'DurableObjectStub'."
		);
	}
	return runInDurableObject(stub, runAlarm);
}

/**
 * Internal method for running `callback` inside the I/O context of the
 * Runner Durable Object.
 *
 * Tests run in this context by default. This is required for performing
 * operations that use Vitest's RPC mechanism as the Durable Object
 * owns the RPC WebSocket. For example, importing modules or sending logs.
 * Trying to perform those operations from a different context (e.g. within
 * a `export default { fetch() {} }` handler or user Durable Object's `fetch()`
 * handler) without using this function will result in a `Cannot perform I/O on
 * behalf of a different request` error.
 */
export function runInRunnerObject<R>(
	callback: (
		instance: __VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__
	) => R | Promise<R>
): Promise<R> {
	// Runner DO is ephemeral (ColoLocalActorNamespace), which has .get(name)
	// instead of the standard idFromName()/get(id) API
	const ns = env["__VITEST_POOL_WORKERS_RUNNER_OBJECT"] as unknown as {
		get(name: string): Fetcher;
	};
	const stub = ns.get("singleton");
	return runInStub(stub, callback);
}

export async function maybeHandleRunRequest(
	request: Request,
	instance: unknown,
	state?: DurableObjectState
): Promise<Response | undefined> {
	const actionId = request.cf?.[CF_KEY_ACTION];
	if (actionId === undefined) {
		return;
	}

	assert(typeof actionId === "number", `Expected numeric ${CF_KEY_ACTION}`);
	try {
		const callback = actionResults.get(actionId);
		assert(typeof callback === "function", `Expected callback for ${actionId}`);
		const result = await callback(instance, state);
		// If the callback returns a `Response`, we can't pass it back to the
		// caller through `actionResults`. If we did that, we'd get a `Cannot
		// perform I/O on behalf of a different Durable Object` error if we
		// tried to use it. Instead, we set a flag in `actionResults` that
		// instructs the caller to use the `Response` returned by
		// `DurableObjectStub#fetch()` directly.
		if (result instanceof Response) {
			actionResults.set(actionId, kUseResponse);
			return result;
		} else {
			actionResults.set(actionId, result);
		}
		return new Response(null, { status: 204 });
	} catch (e) {
		actionResults.set(actionId, e);
		return new Response(null, { status: 500 });
	}
}

export async function listDurableObjectIds(
	namespace: DurableObjectNamespace
): Promise<DurableObjectId[]> {
	if (!isDurableObjectNamespace(namespace)) {
		throw new TypeError(
			"Failed to execute 'listDurableObjectIds': parameter 1 is not of type 'DurableObjectNamespace'."
		);
	}

	// To get an instance of `DurableObjectNamespace`, the user must've bound the
	// namespace to the test runner worker, since `DurableObjectNamespace` has no
	// user-accessible constructor. This means `namespace` must be in `globalEnv`.
	// We can use this to find the bound name for this binding. We inject a
	// mapping between bound names and unique keys for namespaces. We then use
	// this to get a unique key and find all IDs on disk.
	const boundName = Object.entries(env).find(
		(entry) => namespace === entry[1]
	)?.[0];
	assert(boundName !== undefined, "Expected to find bound name for namespace");

	const options = getSerializedOptions();
	const designator = options.durableObjectBindingDesignators?.get(boundName);
	assert(designator !== undefined, "Expected to find designator for namespace");

	let uniqueKey = designator.unsafeUniqueKey;
	if (uniqueKey === undefined) {
		const scriptName = designator.scriptName ?? options.selfName;
		const className = designator.className;
		uniqueKey = `${scriptName}-${className}`;
	}

	const url = `http://placeholder/durable-objects?unique_key=${encodeURIComponent(
		uniqueKey
	)}`;
	const res = await env.__VITEST_POOL_WORKERS_LOOPBACK_SERVICE.fetch(url);
	assert.strictEqual(res.status, 200);
	const ids = await res.json();
	assert(Array.isArray(ids));
	return ids.map((id) => {
		assert(typeof id === "string");
		return namespace.idFromString(id);
	});
}
