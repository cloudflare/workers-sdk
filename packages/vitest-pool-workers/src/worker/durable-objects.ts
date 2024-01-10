import assert from "node:assert";
import { env as globalEnv, getSerializedOptions } from "./env";
import { importModule, mustGetResolvedMainPath } from "./import";

const CF_KEY_ACTION = "vitestPoolWorkersDurableObjectAction";

let nextActionId = 0;
const kUseResponse = Symbol("kUseResponse");
const actionResults = new Map<number /* id */, unknown>();

function isDurableObjectNamespace(v: unknown): v is DurableObjectNamespace {
	return (
		typeof v === "object" &&
		v !== null &&
		v.constructor.name === "DurableObjectNamespace" &&
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
// `isolateDurableObjectBindings` is derived from the user Durable Object
// config. If this were to change, the Miniflare options would change too
// restarting this worker. This means we only need to compute this once, as it
// will automatically invalidate when needed.
let sameIsolatedNamespaces: DurableObjectNamespace[] | undefined;
function getSameIsolateNamespaces(): DurableObjectNamespace[] {
	if (sameIsolatedNamespaces !== undefined) return sameIsolatedNamespaces;
	const options = getSerializedOptions();
	if (options.isolateDurableObjectBindings === undefined) return [];
	sameIsolatedNamespaces = options.isolateDurableObjectBindings.map((name) => {
		const namespace = globalEnv[name];
		assert(
			isDurableObjectNamespace(namespace),
			`Expected ${name} to be a DurableObjectNamespace binding`
		);
		return namespace as DurableObjectNamespace;
	});
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

async function runAlarm(instance: DurableObject, state: DurableObjectState) {
	const alarm = await state.storage.getAlarm();
	if (alarm === null) return false;
	await state.storage.deleteAlarm();
	await instance.alarm?.();
	return true;
}
export function runDurableObjectAlarm(
	stub: DurableObjectStub
): Promise<boolean /* ran */> {
	if (!isDurableObjectStub(stub)) {
		throw new TypeError(
			"Failed to execute 'runDurableObjectAlarm': parameter 1 is not of type 'DurableObjectStub'."
		);
	}
	return runInDurableObject(stub, runAlarm);
}

type DurableObjectConstructor = {
	new (state: DurableObjectState, env: Env): DurableObject;
};
type DurableObjectParameters<K extends keyof DurableObject> = Parameters<
	NonNullable<DurableObject[K]>
>;

// Wrapper for user Durable Object classes defined in this worker,
// intercepts and handles action requests
class DurableObjectWrapper implements DurableObject {
	instanceConstructor?: DurableObjectConstructor;
	instance?: DurableObject;

	constructor(
		readonly state: DurableObjectState,
		readonly env: Env,
		readonly className: string
	) {}

	async ensureInstance(): Promise<DurableObject> {
		const mainPath = mustGetResolvedMainPath("Durable Object");
		// `ensureInstance()` may be called multiple times concurrently.
		// We're assuming `importModule()` will only import the module once.
		const mainModule = await importModule(this.env, mainPath);
		const constructor = mainModule[this.className];
		if (typeof constructor !== "function") {
			throw new Error(
				`${mainPath} does not export a ${this.className} Durable Object`
			);
		}
		this.instanceConstructor ??= constructor as DurableObjectConstructor;
		if (this.instanceConstructor !== constructor) {
			// Unlikely to hit this case if aborting all Durable Objects at the
			// start/end of each test
			await this.state.blockConcurrencyWhile<never>(() => {
				// Throw inside `blockConcurrencyWhile()` to abort this object
				throw new Error(
					`${mainPath} changed, invalidating this Durable Object. ` +
						"Please retry the `DurableObjectStub#fetch()` call."
				);
			});
			assert.fail("Unreachable");
		}
		if (this.instance === undefined) {
			this.instance = new this.instanceConstructor(this.state, this.env);
			// Wait for any `blockConcurrencyWhile()`s in the constructor to complete
			await this.state.blockConcurrencyWhile(async () => {});
		}
		return this.instance;
	}

	async fetch(request: Request): Promise<Response> {
		// Make sure we've initialised user code
		const instance = await this.ensureInstance();

		// If this is an internal Durable Object action, handle it...
		const actionId = request.cf?.[CF_KEY_ACTION];
		if (typeof actionId === "number") {
			try {
				const callback = actionResults.get(actionId);
				assert(
					typeof callback === "function",
					`Expected callback for ${actionId}`
				);
				const result = await callback(instance, this.state);
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

		// Otherwise, pass through to the user code
		if (instance.fetch === undefined) {
			throw new Error("Handler does not export a fetch() function.");
		}
		return instance.fetch(request);
	}

	async alarm(...args: DurableObjectParameters<"alarm">) {
		const instance = await this.ensureInstance();
		return instance.alarm?.(...args);
	}
	async webSocketMessage(...args: DurableObjectParameters<"webSocketMessage">) {
		const instance = await this.ensureInstance();
		return instance.webSocketMessage?.(...args);
	}
	async webSocketClose(...args: DurableObjectParameters<"webSocketClose">) {
		const instance = await this.ensureInstance();
		return instance.webSocketClose?.(...args);
	}
	async webSocketError(...args: DurableObjectParameters<"webSocketError">) {
		const instance = await this.ensureInstance();
		return instance.webSocketError?.(...args);
	}
}

export function createDurableObjectWrapper(
	className: string
): DurableObjectConstructor {
	return class extends DurableObjectWrapper {
		constructor(state: DurableObjectState, env: Env) {
			super(state, env, className);
		}
	};
}
