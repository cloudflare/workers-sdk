import {
	DurableObject,
	WorkerEntrypoint,
	WorkflowEntrypoint,
} from "cloudflare:workers";
import { INIT_PATH, VITE_DEV_METADATA_HEADER } from "../shared";
import { stripInternalEnv } from "./env";
import { createModuleRunner, getWorkerEntryExport } from "./module-runner";
import type { WrapperEnv } from "./env";

interface WorkerEntrypointConstructor<T = unknown> {
	new (
		...args: ConstructorParameters<typeof WorkerEntrypoint<T>>
	): WorkerEntrypoint<T>;
}

interface DurableObjectConstructor<T = unknown> {
	new (
		...args: ConstructorParameters<typeof DurableObject<T>>
	): DurableObject<T>;
}

interface WorkflowEntrypointConstructor<T = unknown> {
	new (
		...args: ConstructorParameters<typeof WorkflowEntrypoint<T>>
	): WorkflowEntrypoint<T>;
}

const IGNORED_KEYS = ["self", "tailStream"];

const WORKER_ENTRYPOINT_KEYS = [
	"fetch",
	"queue",
	"tail",
	"test",
	"trace",
	"scheduled",
] as const;

const DURABLE_OBJECT_KEYS = [
	"alarm",
	"fetch",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
] as const;

const WORKFLOW_ENTRYPOINT_KEYS = ["run"] as const;

let entryPath = "";

function getRpcProperty(
	ctor: WorkerEntrypointConstructor | DurableObjectConstructor,
	instance: WorkerEntrypoint | DurableObject,
	key: string
): unknown {
	const prototypeHasKey = Reflect.has(ctor.prototype, key);

	if (!prototypeHasKey) {
		const instanceHasKey = Reflect.has(instance, key);

		if (instanceHasKey) {
			throw new TypeError(
				[
					`The RPC receiver's prototype does not implement '${key}', but the receiver instance does.`,
					"Only properties and methods defined on the prototype can be accessed over RPC.",
					`Ensure properties are declared as \`get ${key}() { ... }\` instead of \`${key} = ...\`,`,
					`and methods are declared as \`${key}() { ... }\` instead of \`${key} = () => { ... }\`.`,
				].join("\n")
			);
		}

		throw new TypeError(`The RPC receiver does not implement '${key}'.`);
	}

	return Reflect.get(ctor.prototype, key, instance);
}

function getRpcPropertyCallableThenable(
	key: string,
	property: Promise<unknown>
): Promise<unknown> & ((...args: unknown[]) => Promise<unknown>) {
	const fn = async function (...args: unknown[]) {
		const maybeFn = await property;

		if (typeof maybeFn !== "function") {
			throw new TypeError(`'${key}' is not a function.`);
		}

		return maybeFn(...args);
	} as Promise<unknown> & ((...args: unknown[]) => Promise<unknown>);

	fn.then = (onFulfilled, onRejected) => property.then(onFulfilled, onRejected);
	fn.catch = (onRejected) => property.catch(onRejected);
	fn.finally = (onFinally) => property.finally(onFinally);

	return fn;
}

async function getWorkerEntrypointRpcProperty(
	this: WorkerEntrypoint<WrapperEnv>,
	entrypoint: string,
	key: string
): Promise<unknown> {
	const ctor = (await getWorkerEntryExport(
		entryPath,
		entrypoint
	)) as WorkerEntrypointConstructor;
	const userEnv = stripInternalEnv(this.env);
	const expectedWorkerEntrypointMessage = `Expected ${entrypoint} export of ${entryPath} to be a subclass of \`WorkerEntrypoint\` for RPC.`;

	if (typeof ctor !== "function") {
		throw new TypeError(expectedWorkerEntrypointMessage);
	}

	const instance = new ctor(this.ctx, userEnv);

	if (!(instance instanceof WorkerEntrypoint)) {
		throw new TypeError(expectedWorkerEntrypointMessage);
	}

	const value = getRpcProperty(ctor, instance, key);

	if (typeof value === "function") {
		return value.bind(instance);
	}

	return value;
}

export function createWorkerEntrypointWrapper(
	entrypoint: string
): WorkerEntrypointConstructor<WrapperEnv> {
	class Wrapper extends WorkerEntrypoint<WrapperEnv> {
		constructor(ctx: ExecutionContext, env: WrapperEnv) {
			super(ctx, env);

			return new Proxy(this, {
				get(target, key, receiver) {
					const value = Reflect.get(target, key, receiver);

					if (value !== undefined) {
						return value;
					}

					if (
						typeof key === "symbol" ||
						IGNORED_KEYS.includes(key) ||
						(DURABLE_OBJECT_KEYS as readonly string[]).includes(key)
					) {
						return;
					}

					const property = getWorkerEntrypointRpcProperty.call(
						receiver,
						entrypoint,
						key
					);

					return getRpcPropertyCallableThenable(key, property);
				},
			});
		}
	}

	for (const key of WORKER_ENTRYPOINT_KEYS) {
		Wrapper.prototype[key] = async function (arg) {
			if (key === "fetch") {
				const request = arg as Request;
				const url = new URL(request.url);

				let webSocket: WebSocket;
				if (url.pathname === INIT_PATH) {
					try {
						const viteDevMetadata = getViteDevMetadata(request);
						entryPath = viteDevMetadata.entryPath;
						const { 0: client, 1: server } = new WebSocketPair();
						webSocket = client;
						await createModuleRunner(this.env, server);
					} catch (e) {
						return new Response(
							e instanceof Error ? e.message : JSON.stringify(e),
							{ status: 500 }
						);
					}

					return new Response(null, {
						status: 101,
						webSocket,
					});
				}
			}

			const entrypointValue = await getWorkerEntryExport(entryPath, entrypoint);
			const userEnv = stripInternalEnv(this.env);

			if (typeof entrypointValue === "object" && entrypointValue !== null) {
				// ExportedHandler
				const maybeFn = (entrypointValue as Record<string, unknown>)[key];

				if (typeof maybeFn !== "function") {
					throw new TypeError(
						`Expected ${entrypoint} export of ${entryPath} to define a \`${key}()\` function.`
					);
				}

				return maybeFn.call(entrypointValue, arg, userEnv, this.ctx);
			} else if (typeof entrypointValue === "function") {
				// WorkerEntrypoint
				const ctor = entrypointValue as WorkerEntrypointConstructor;
				const instance = new ctor(this.ctx, userEnv);

				if (!(instance instanceof WorkerEntrypoint)) {
					throw new TypeError(
						`Expected ${entrypoint} export of ${entryPath} to be a subclass of \`WorkerEntrypoint\`.`
					);
				}

				const maybeFn = instance[key];

				if (typeof maybeFn !== "function") {
					throw new TypeError(
						`Expected ${entrypoint} export of ${entryPath} to define a \`${key}()\` method.`
					);
				}

				return (maybeFn as (arg: unknown) => unknown).call(instance, arg);
			} else {
				return new TypeError(
					`Expected ${entrypoint} export of ${entryPath} to be an object or a class. Got ${entrypointValue}.`
				);
			}
		};
	}

	return Wrapper;
}

const kInstance = Symbol("kInstance");
const kEnsureInstance = Symbol("kEnsureInstance");

interface DurableObjectInstance {
	ctor: DurableObjectConstructor;
	instance: DurableObject;
}

interface DurableObjectWrapper extends DurableObject<WrapperEnv> {
	[kInstance]?: DurableObjectInstance;
	[kEnsureInstance](): Promise<DurableObjectInstance>;
}

async function getDurableObjectRpcProperty(
	this: DurableObjectWrapper,
	className: string,
	key: string
): Promise<unknown> {
	const { ctor, instance } = await this[kEnsureInstance]();

	if (!(instance instanceof DurableObject)) {
		throw new TypeError(
			`Expected ${className} export of ${entryPath} to be a subclass of \`DurableObject\` for RPC.`
		);
	}

	const value = getRpcProperty(ctor, instance, key);

	if (typeof value === "function") {
		return value.bind(instance);
	}

	return value;
}

export function createDurableObjectWrapper(
	className: string
): DurableObjectConstructor<WrapperEnv> {
	class Wrapper
		extends DurableObject<WrapperEnv>
		implements DurableObjectWrapper
	{
		[kInstance]?: DurableObjectInstance;

		constructor(ctx: DurableObjectState, env: WrapperEnv) {
			super(ctx, env);

			return new Proxy(this, {
				get(target, key, receiver) {
					const value = Reflect.get(target, key, receiver);

					if (value !== undefined) {
						return value;
					}

					if (
						typeof key === "symbol" ||
						IGNORED_KEYS.includes(key) ||
						(WORKER_ENTRYPOINT_KEYS as readonly string[]).includes(key)
					) {
						return;
					}

					const property = getDurableObjectRpcProperty.call(
						receiver,
						className,
						key
					);

					return getRpcPropertyCallableThenable(key, property);
				},
			});
		}

		async [kEnsureInstance]() {
			const ctor = (await getWorkerEntryExport(
				entryPath,
				className
			)) as DurableObjectConstructor;

			if (typeof ctor !== "function") {
				throw new TypeError(
					`${entryPath} does not export a ${className} Durable Object.`
				);
			}

			if (!this[kInstance] || this[kInstance].ctor !== ctor) {
				const userEnv = stripInternalEnv(this.env);
				const instance = new ctor(this.ctx, userEnv);

				this[kInstance] = { ctor, instance };

				// Wait for `blockConcurrencyWhile()`s in the constructor to complete
				await this.ctx.blockConcurrencyWhile(async () => {});
			}

			return this[kInstance];
		}
	}

	for (const key of DURABLE_OBJECT_KEYS) {
		Wrapper.prototype[key] = async function (...args: unknown[]) {
			const { instance } = await this[kEnsureInstance]();
			const maybeFn = instance[key];

			if (typeof maybeFn !== "function") {
				throw new TypeError(
					`Expected ${className} export of ${entryPath} to define a \`${key}()\` function.`
				);
			}

			return (maybeFn as (...args: unknown[]) => any).apply(instance, args);
		};
	}

	return Wrapper;
}

export function createWorkflowEntrypointWrapper(
	className: string
): WorkflowEntrypointConstructor<WrapperEnv> {
	class Wrapper extends WorkflowEntrypoint<WrapperEnv> {}

	for (const key of WORKFLOW_ENTRYPOINT_KEYS) {
		Wrapper.prototype[key] = async function (...args: unknown[]) {
			const ctor = (await getWorkerEntryExport(
				entryPath,
				className
			)) as WorkflowEntrypointConstructor;
			const userEnv = stripInternalEnv(this.env);
			const instance = new ctor(this.ctx, userEnv);

			if (!(instance instanceof WorkflowEntrypoint)) {
				throw new TypeError(
					`Expected ${className} export of ${entryPath} to be a subclass of \`WorkflowEntrypoint\`.`
				);
			}

			const maybeFn = instance[key];

			if (typeof maybeFn !== "function") {
				throw new TypeError(
					`Expected ${className} export of ${entryPath} to define a \`${key}()\` function.`
				);
			}

			return (maybeFn as (...args: unknown[]) => any).apply(instance, args);
		};
	}

	return Wrapper;
}

function getViteDevMetadata(request: Request) {
	const viteDevMetadataHeader = request.headers.get(VITE_DEV_METADATA_HEADER);
	if (viteDevMetadataHeader === null) {
		throw new Error(
			"Unexpected internal error, vite dev metadata header not set"
		);
	}

	let parsedViteDevMetadataHeader: Record<string, string>;
	try {
		parsedViteDevMetadataHeader = JSON.parse(viteDevMetadataHeader);
	} catch {
		throw new Error(
			`Unexpected internal error, vite dev metadata header JSON parsing failed, value = ${viteDevMetadataHeader}`
		);
	}

	const { entryPath } = parsedViteDevMetadataHeader;

	if (entryPath === undefined) {
		throw new Error(
			"Unexpected internal error, vite dev metadata header doesn't contain an entryPath value"
		);
	}

	return { entryPath };
}
