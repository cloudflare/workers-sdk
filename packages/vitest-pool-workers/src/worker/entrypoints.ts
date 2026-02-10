import assert from "node:assert";
import {
	DurableObject as DurableObjectClass,
	WorkerEntrypoint,
	WorkflowEntrypoint,
} from "cloudflare:workers";
import { maybeHandleRunRequest, runInRunnerObject } from "./durable-objects";
import { getResolvedMainPath, stripInternalEnv } from "./env";
import { patchAndRunWithHandlerContext } from "./patch-ctx";

// =============================================================================
// Common Entrypoint Helpers
// =============================================================================

/**
 * Internal method for importing a module using Vite's transformation and
 * execution pipeline. Can be called from any I/O context, and will ensure the
 * request is run from within the `__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__`.
 */
function importModule(
	env: Env,
	specifier: string
): Promise<Record<string, unknown>> {
	return runInRunnerObject(env, (instance) => {
		if (instance.executor === undefined) {
			const message =
				"Expected Vitest to start running before importing modules.\n" +
				"This usually means you have multiple `vitest` versions installed.\n" +
				"Use your package manager's `why` command to list versions and why each is installed (e.g. `npm why vitest`).";
			throw new Error(message);
		}
		return instance.executor.executeId(specifier);
	});
}

const IGNORED_KEYS = ["self"];

/**
 * Create a class extending `superClass` with a `Proxy` as a `prototype`.
 * Unknown accesses on the `prototype` will defer to `getUnknownPrototypeKey()`.
 * `workerd` will only look for RPC methods/properties on the prototype, not the
 * instance. This helps avoid accidentally exposing things over RPC, but makes
 * things a little trickier for us...
 */
function createProxyPrototypeClass<
	T extends
		| typeof WorkerEntrypoint
		| typeof DurableObjectClass
		| typeof WorkflowEntrypoint,
	ExtraPrototype = unknown,
>(
	superClass: T,
	getUnknownPrototypeKey: (key: string) => unknown
): T & { prototype: ExtraPrototype } {
	// Build a class with a "Proxy"-prototype, so we can intercept RPC calls
	function Class(...args: ConstructorParameters<typeof superClass>) {
		// Delay proxying prototype until construction, so workerd sees this as a
		// regular class when introspecting it. This check fails if we don't do this:
		// https://github.com/cloudflare/workerd/blob/9e915ed637d65adb3c57522607d2cd8b8d692b6b/src/workerd/io/worker.c%2B%2B#L1920-L1921
		Class.prototype = new Proxy(Class.prototype, {
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver);
				if (value !== undefined) {
					return value;
				}
				// noinspection SuspiciousTypeOfGuard
				if (typeof key === "symbol" || IGNORED_KEYS.includes(key)) {
					return;
				}
				return getUnknownPrototypeKey.call(receiver, key as string);
			},
		});

		return Reflect.construct(superClass, args, Class);
	}

	Reflect.setPrototypeOf(Class.prototype, superClass.prototype);
	Reflect.setPrototypeOf(Class, superClass);

	return Class as unknown as T & { prototype: ExtraPrototype };
}

/**
 * Only properties and methods declared on the prototype can be accessed over
 * RPC. This function gets a property from the prototype if it's defined, and
 * throws a helpful error message if not. Note we need to distinguish between a
 * property that returns `undefined` and something not being defined at all.
 */
function getRPCProperty(
	ctor: WorkerEntrypointConstructor | DurableObjectConstructor,
	instance: WorkerEntrypoint | DurableObjectClass,
	key: string
): unknown {
	const prototypeHasKey = Reflect.has(ctor.prototype, key);
	if (!prototypeHasKey) {
		const quotedKey = JSON.stringify(key);
		const instanceHasKey = Reflect.has(instance, key);
		let message = "";
		if (instanceHasKey) {
			message = [
				`The RPC receiver's prototype does not implement ${quotedKey}, but the receiver instance does.`,
				"Only properties and methods defined on the prototype can be accessed over RPC.",
				`Ensure properties are declared like \`get ${key}() { ... }\` instead of \`${key} = ...\`,`,
				`and methods are declared like \`${key}() { ... }\` instead of \`${key} = () => { ... }\`.`,
			].join("\n");
		} else {
			message = `The RPC receiver does not implement ${quotedKey}.`;
		}
		throw new TypeError(message);
	}

	// `receiver` is the value of `this` provided if a getter is encountered
	return Reflect.get(/* target */ ctor.prototype, key, /* receiver */ instance);
}

/**
 * When calling RPC methods dynamically, we don't know whether the `property`
 * returned from `getSELFRPCProperty()` or `getDurableObjectRPCProperty()` below
 * is just a property or a method. If we just returned `property`, but the
 * client tried to call it as a method, `workerd` would throw an "x is not a
 * function" error.
 *
 * Instead, we return a *callable, custom thenable*. This behaves like a
 * function and a `Promise`! If `workerd` calls it, we'll wait for the promise
 * to resolve then forward the call. Otherwise, this just appears like a regular
 * async property. Note all client calls are async, so converting sync
 * properties and methods to async is fine here.
 *
 * Unfortunately, wrapping `property` with a `Proxy` and an `apply()` trap gives
 * `TypeError: Method Promise.prototype.then called on incompatible receiver #<Promise>`. :(
 */
function getRPCPropertyCallableThenable(
	key: string,
	property: Promise<unknown>
) {
	const fn = async function (...args: unknown[]) {
		const maybeFn = await property;
		if (typeof maybeFn === "function") {
			return maybeFn(...args);
		} else {
			throw new TypeError(`${JSON.stringify(key)} is not a function.`);
		}
	} as Promise<unknown> & ((...args: unknown[]) => Promise<unknown>);
	fn.then = (onFulfilled, onRejected) => property.then(onFulfilled, onRejected);
	fn.catch = (onRejected) => property.catch(onRejected);
	fn.finally = (onFinally) => property.finally(onFinally);
	return fn;
}

/**
 * `ctx` and `env` are defined as `protected` within `WorkerEntrypoint` and
 * `DurableObjectClass`. Usually this isn't a problem, as `protected` members
 * can be accessed from subclasses defined with `class extends` keywords.
 * Unfortunately, we have to define our classes with a `Proxy` prototype to
 * support forwarding RPC. This prevents us accessing `protected` members.
 * Instead, we define this function to extract these members, and provide type
 * safety for callers.
 */
function getEntrypointState(instance: WorkerEntrypoint<InternalUserEnv>): {
	ctx: ExecutionContext;
	env: InternalUserEnv;
};
function getEntrypointState(instance: DurableObjectClass<InternalUserEnv>): {
	ctx: DurableObjectState;
	env: InternalUserEnv;
};
function getEntrypointState(
	instance:
		| WorkerEntrypoint<InternalUserEnv>
		| DurableObjectClass<InternalUserEnv>
) {
	return instance as unknown as {
		ctx: ExecutionContext | DurableObjectState;
		env: InternalUserEnv;
	};
}

const WORKER_ENTRYPOINT_KEYS = [
	"tailStream",
	"fetch",
	"tail",
	"trace",
	"scheduled",
	"queue",
	"test",
	"tailStream",
	"email",
] as const;
const DURABLE_OBJECT_KEYS = [
	"fetch",
	"alarm",
	"webSocketMessage",
	"webSocketClose",
	"webSocketError",
] as const;

// This type will grab the keys from T and remove "branded" keys
type UnbrandedKeys<T> = Exclude<keyof T, `__${string}_BRAND`>;

// Check that we've included all possible keys
// noinspection JSUnusedLocalSymbols
const _workerEntrypointExhaustive: (typeof WORKER_ENTRYPOINT_KEYS)[number] =
	undefined as unknown as UnbrandedKeys<WorkerEntrypoint<Env>>;
// noinspection JSUnusedLocalSymbols
const _durableObjectExhaustive: (typeof DURABLE_OBJECT_KEYS)[number] =
	undefined as unknown as UnbrandedKeys<DurableObjectClass<Env>>;

// =============================================================================
// `WorkerEntrypoint` wrappers
// =============================================================================

// `WorkerEntrypoint` is `abstract`, so we need to cast before constructing
type WorkerEntrypointConstructor = {
	new (
		...args: ConstructorParameters<typeof WorkerEntrypoint>
	): WorkerEntrypoint;
};

/**
 * Get the export to use for `entrypoint`. This is used for the `SELF` service
 * binding in `cloudflare:test`, which sets `entrypoint` to "default".
 * This requires importing the `main` module with Vite.
 */
async function getWorkerEntrypointExport(
	env: Env,
	entrypoint: string
): Promise<{ mainPath: string; entrypointValue: unknown }> {
	const mainPath = getResolvedMainPath("service");
	const mainModule = await importModule(env, mainPath);
	const entrypointValue =
		typeof mainModule === "object" &&
		mainModule !== null &&
		entrypoint in mainModule &&
		mainModule[entrypoint];
	if (!entrypointValue) {
		const message =
			`${mainPath} does not export a ${entrypoint} entrypoint. \`@cloudflare/vitest-pool-workers\` does not support service workers or named entrypoints for \`SELF\`.\n` +
			"If you're using service workers, please migrate to the modules format: https://developers.cloudflare.com/workers/reference/migrate-to-module-workers.";
		throw new TypeError(message);
	}
	return { mainPath, entrypointValue };
}

/**
 * Get a property named `key` from the user's `WorkerEntrypoint`. `wrapper` here
 * is an instance of a `WorkerEntrypoint` wrapper (i.e. the return value of
 * `createWorkerEntrypointWrapper()`). This requires importing the `main` module
 * with Vite, so will always return a `Promise.`
 */
async function getWorkerEntrypointRPCProperty(
	wrapper: WorkerEntrypoint<InternalUserEnv>,
	entrypoint: string,
	key: string
): Promise<unknown> {
	const { ctx, env } = getEntrypointState(wrapper);
	const { mainPath, entrypointValue } = await getWorkerEntrypointExport(
		env,
		entrypoint
	);
	const userEnv = stripInternalEnv(env);
	// Ensure constructor and properties execute with ctx `AsyncLocalStorage` set
	return patchAndRunWithHandlerContext(ctx, () => {
		const expectedWorkerEntrypointMessage = `Expected ${entrypoint} export of ${mainPath} to be a subclass of \`WorkerEntrypoint\` for RPC`;
		if (typeof entrypointValue !== "function") {
			throw new TypeError(expectedWorkerEntrypointMessage);
		}
		const ctor = entrypointValue as WorkerEntrypointConstructor;
		const instance = new ctor(ctx, userEnv);
		// noinspection SuspiciousTypeOfGuard
		if (!(instance instanceof WorkerEntrypoint)) {
			throw new TypeError(expectedWorkerEntrypointMessage);
		}

		const value = getRPCProperty(ctor, instance, key);
		if (typeof value === "function") {
			// If this is a function, ensure it executes with ctx `AsyncLocalStorage`
			// set, and with a correctly bound `this`
			return (...args: unknown[]) =>
				patchAndRunWithHandlerContext(ctx, () => value.apply(instance, args));
		} else {
			return value;
		}
	});
}

export function createWorkerEntrypointWrapper(
	entrypoint: string
): typeof WorkerEntrypoint {
	const Wrapper = createProxyPrototypeClass(
		WorkerEntrypoint,
		function (this: WorkerEntrypoint<InternalUserEnv>, key) {
			// All `ExportedHandler` keys are reserved and cannot be called over RPC
			if ((DURABLE_OBJECT_KEYS as readonly string[]).includes(key)) {
				return;
			}

			const property = getWorkerEntrypointRPCProperty(this, entrypoint, key);
			return getRPCPropertyCallableThenable(key, property);
		}
	);

	// Add prototype methods for all default handlers
	// const prototype = Entrypoint.prototype as unknown as Record<string, unknown>;
	for (const key of WORKER_ENTRYPOINT_KEYS) {
		Wrapper.prototype[key] = async function (
			this: WorkerEntrypoint<InternalUserEnv>,
			thing: unknown
		) {
			const { mainPath, entrypointValue } = await getWorkerEntrypointExport(
				this.env,
				entrypoint
			);
			const userEnv = stripInternalEnv(this.env);
			return patchAndRunWithHandlerContext(this.ctx, () => {
				if (typeof entrypointValue === "object" && entrypointValue !== null) {
					// Assuming the user has defined an `ExportedHandler`
					const maybeFn = (entrypointValue as Record<string, unknown>)[key];
					if (typeof maybeFn === "function") {
						return maybeFn.call(entrypointValue, thing, userEnv, this.ctx);
					} else {
						const message = `Expected ${entrypoint} export of ${mainPath} to define a \`${key}()\` function`;
						throw new TypeError(message);
					}
				} else if (typeof entrypointValue === "function") {
					// Assuming the user has defined a `WorkerEntrypoint` subclass
					const ctor = entrypointValue as WorkerEntrypointConstructor;
					const instance = new ctor(this.ctx, userEnv);
					// noinspection SuspiciousTypeOfGuard
					if (!(instance instanceof WorkerEntrypoint)) {
						const message = `Expected ${entrypoint} export of ${mainPath} to be a subclass of \`WorkerEntrypoint\``;
						throw new TypeError(message);
					}
					const maybeFn = instance[key];
					if (typeof maybeFn === "function") {
						return (maybeFn as (arg: unknown) => unknown).call(instance, thing);
					} else {
						const message = `Expected ${entrypoint} export of ${mainPath} to define a \`${key}()\` method`;
						throw new TypeError(message);
					}
				} else {
					// Assuming the user has messed up
					const message = `Expected ${entrypoint} export of ${mainPath}to be an object or a class, got ${entrypointValue}`;
					throw new TypeError(message);
				}
			});
		};
	}

	return Wrapper;
}

// =============================================================================
// `DurableObject` wrappers
// =============================================================================

type DurableObjectConstructor = {
	new (
		...args: ConstructorParameters<typeof DurableObjectClass>
	): DurableObject | DurableObjectClass<Record<string, unknown>>;
};

const kInstanceConstructor = Symbol("kInstanceConstructor");
const kInstance = Symbol("kInstance");
const kEnsureInstance = Symbol("kEnsureInstance");
type DurableObjectWrapperExtraPrototype = {
	[kInstanceConstructor]: DurableObjectConstructor;
	[kInstance]: DurableObject | DurableObjectClass<Record<string, unknown>>;
	[kEnsureInstance](): Promise<{
		mainPath: string;
		instanceCtor: DurableObjectConstructor;
		instance: DurableObject | DurableObjectClass<Record<string, unknown>>;
	}>;
};
type DurableObjectWrapper = DurableObjectClass<InternalUserEnv> &
	DurableObjectWrapperExtraPrototype;

async function getDurableObjectRPCProperty(
	wrapper: DurableObjectWrapper,
	className: string,
	key: string
): Promise<unknown> {
	const { mainPath, instanceCtor, instance } = await wrapper[kEnsureInstance]();
	if (!(instance instanceof DurableObjectClass)) {
		const message = `Expected ${className} exported by ${mainPath} be a subclass of \`DurableObject\` for RPC`;
		throw new TypeError(message);
	}
	const value = getRPCProperty(instanceCtor, instance, key);
	if (typeof value === "function") {
		// If this is a function, ensure correctly bound `this`
		return value.bind(instance);
	} else {
		return value;
	}
}

export function createDurableObjectWrapper(
	className: string
): typeof DurableObjectClass {
	const Wrapper = createProxyPrototypeClass<
		typeof DurableObjectClass,
		DurableObjectWrapperExtraPrototype
	>(DurableObjectClass, function (this: DurableObjectWrapper, key) {
		// All `ExportedHandler` keys are reserved and cannot be called over RPC
		if ((WORKER_ENTRYPOINT_KEYS as readonly string[]).includes(key)) {
			return;
		}

		const property = getDurableObjectRPCProperty(this, className, key);
		return getRPCPropertyCallableThenable(key, property);
	});

	Wrapper.prototype[kEnsureInstance] = async function (
		this: DurableObjectWrapper
	) {
		const { ctx, env } = getEntrypointState(this);
		const mainPath = getResolvedMainPath("Durable Object");
		// `ensureInstance()` may be called multiple times concurrently.
		// We're assuming `importModule()` will only import the module once.
		const mainModule = await importModule(env, mainPath);
		const constructor = mainModule[className];
		if (typeof constructor !== "function") {
			throw new TypeError(
				`${mainPath} does not export a ${className} Durable Object`
			);
		}
		this[kInstanceConstructor] ??= constructor as DurableObjectConstructor;
		if (this[kInstanceConstructor] !== constructor) {
			// This would be if the module was invalidated
			// (i.e. source file changed), then the Durable Object was `fetch()`ed
			// again. We reset all Durable Object instances between each test, so it's
			// unlikely multiple constructors would be used by the same instance,
			// unless the user did something funky with Durable Objects outside tests.
			await ctx.blockConcurrencyWhile<never>(() => {
				// Throw inside `blockConcurrencyWhile()` to abort this object
				throw new Error(
					`${mainPath} changed, invalidating this Durable Object. ` +
						"Please retry the `DurableObjectStub#fetch()` call."
				);
			});
			assert.fail("Unreachable");
		}
		if (this[kInstance] === undefined) {
			const userEnv = stripInternalEnv(env);
			this[kInstance] = new this[kInstanceConstructor](ctx, userEnv);
			// Wait for any `blockConcurrencyWhile()`s in the constructor to complete
			await ctx.blockConcurrencyWhile(async () => {});
		}
		return {
			mainPath,
			instanceCtor: this[kInstanceConstructor],
			instance: this[kInstance],
		};
	};

	// Add prototype method for `fetch` handler to handle `runInDurableObject()`s
	Wrapper.prototype.fetch = async function (
		this: DurableObjectWrapper,
		request: Request
	) {
		const { ctx } = getEntrypointState(this);

		// Make sure we've initialised user code
		const { mainPath, instance } = await this[kEnsureInstance]();

		// If this is an internal Durable Object action, handle it...
		const response = await maybeHandleRunRequest(request, instance, ctx);
		if (response !== undefined) {
			return response;
		}

		// Otherwise, pass through to the user code
		if (instance.fetch === undefined) {
			const message = `${className} exported by ${mainPath} does not define a \`fetch()\` method`;
			throw new TypeError(message);
		}
		return instance.fetch(request);
	};

	// Add prototype methods for all other default handlers
	for (const key of DURABLE_OBJECT_KEYS) {
		if (key === "fetch") {
			continue;
		} // `fetch()` has special handling above
		Wrapper.prototype[key] = async function (
			this: DurableObjectWrapper,
			...args: unknown[]
		) {
			const { mainPath, instance } = await this[kEnsureInstance]();
			const maybeFn = instance[key];
			if (typeof maybeFn === "function") {
				return (maybeFn as (...a: unknown[]) => void).apply(instance, args);
			} else {
				const message = `${className} exported by ${mainPath} does not define a \`${key}()\` method`;
				throw new TypeError(message);
			}
		};
	}

	return Wrapper;
}

// =============================================================================
// `WorkflowEntrypoint` wrappers
// =============================================================================

type WorkflowEntrypointConstructor = {
	new (
		...args: ConstructorParameters<typeof WorkflowEntrypoint>
	): WorkflowEntrypoint;
};

export function createWorkflowEntrypointWrapper(entrypoint: string) {
	const Wrapper = createProxyPrototypeClass(
		WorkflowEntrypoint,
		function (this: WorkflowEntrypoint<InternalUserEnv>, key) {
			// only Workflow `run` should be exposed over RPC
			if (!["run"].includes(key)) {
				return;
			}

			const property = getWorkerEntrypointRPCProperty(
				this as unknown as WorkerEntrypoint<InternalUserEnv>,
				entrypoint,
				key
			);
			return getRPCPropertyCallableThenable(key, property);
		}
	);

	Wrapper.prototype.run = async function (
		this: WorkflowEntrypoint<InternalUserEnv>,
		...args
	) {
		const { mainPath, entrypointValue } = await getWorkerEntrypointExport(
			this.env,
			entrypoint
		);
		const userEnv = stripInternalEnv(this.env);
		// workflow entrypoint value should always be a constructor
		if (typeof entrypointValue === "function") {
			// Assuming the user has defined a `WorkflowEntrypoint` subclass
			const ctor = entrypointValue as WorkflowEntrypointConstructor;
			const instance = new ctor(this.ctx, userEnv);
			// noinspection SuspiciousTypeOfGuard
			if (!(instance instanceof WorkflowEntrypoint)) {
				const message = `Expected ${entrypoint} export of ${mainPath} to be a subclass of \`WorkflowEntrypoint\``;
				throw new TypeError(message);
			}
			const maybeFn = instance["run"];
			if (typeof maybeFn === "function") {
				return patchAndRunWithHandlerContext(this.ctx, () =>
					maybeFn.call(instance, ...args)
				);
			} else {
				const message = `Expected ${entrypoint} export of ${mainPath} to define a \`run()\` method, but got ${typeof maybeFn}`;
				throw new TypeError(message);
			}
		} else {
			// Assuming the user has messed up
			const message = `Expected ${entrypoint} export of ${mainPath} to be a subclass of \`WorkflowEntrypoint\`, but got ${entrypointValue}`;
			throw new TypeError(message);
		}
	};

	return Wrapper;
}
