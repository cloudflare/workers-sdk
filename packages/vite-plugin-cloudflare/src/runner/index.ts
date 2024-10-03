import { WorkerEntrypoint } from 'cloudflare:workers';
import { createModuleRunner, getWorkerEntrypointExport } from './module-runner';
import { INIT_PATH } from '../shared';
import type { WrapperEnv } from './env';

interface WorkerEntrypointConstructor<T = unknown> {
	new (
		...args: ConstructorParameters<typeof WorkerEntrypoint<T>>
	): WorkerEntrypoint<T>;
}

const WORKER_ENTRYPOINT_KEYS = [
	'fetch',
	'tail',
	'trace',
	'scheduled',
	'queue',
	'test',
] as const;

const DURABLE_OBJECT_KEYS = [
	'fetch',
	'alarm',
	'webSocketMessage',
	'webSocketClose',
	'webSocketError',
] as const;

function stripInternalEnv(internalEnv: WrapperEnv) {
	const {
		__VITE_ROOT__,
		__VITE_ENTRY_PATH__,
		__VITE_FETCH_MODULE__,
		__VITE_UNSAFE_EVAL__,
		...userEnv
	} = internalEnv;

	return userEnv;
}

function getRpcProperty(
	ctor: WorkerEntrypointConstructor,
	instance: WorkerEntrypoint,
	key: string,
) {
	const prototypeHasKey = Reflect.has(ctor.prototype, key);

	if (!prototypeHasKey) {
		const instanceHasKey = Reflect.has(instance, key);

		if (instanceHasKey) {
			throw new Error(
				[
					`The RPC receiver's prototype does not implement '${key}', but the receiver instance does.`,
					'Only properties and methods defined on the prototype can be accessed over RPC.',
					`Ensure properties are declared as \`get ${key}() { ... }\` instead of \`${key} = ...\`,`,
					`and methods are declared as \`${key}() { ... }\` instead of \`${key} = () => { ... }\`.`,
				].join('\n'),
			);
		}

		throw new Error(`The RPC receiver does not implement '${key}'.`);
	}

	return Reflect.get(ctor.prototype, key, instance);
}

async function getWorkerEntrypointRpcProperty(
	this: WorkerEntrypoint<WrapperEnv>,
	entrypoint: string,
	key: string,
) {
	const entryPath = this.env.__VITE_ENTRY_PATH__;
	const ctor = (await getWorkerEntrypointExport(
		entryPath,
		entrypoint,
	)) as WorkerEntrypointConstructor;
	const userEnv = stripInternalEnv(this.env);
	const expectedWorkerEntrypointMessage = `Expected ${entrypoint} export of ${entryPath} to be a subclass of \`WorkerEntrypoint\` for RPC.`;

	if (typeof ctor !== 'function') {
		throw new Error(expectedWorkerEntrypointMessage);
	}

	const instance = new ctor(this.ctx, userEnv);

	if (!(instance instanceof WorkerEntrypoint)) {
		throw new Error(expectedWorkerEntrypointMessage);
	}

	return getRpcProperty(ctor, instance, key);
}

function getRpcPropertyCallableThenable(
	key: string,
	property: Promise<unknown>,
) {
	const fn = async function (...args: unknown[]) {
		const maybeFn = await property;

		if (typeof maybeFn !== 'function') {
			throw new Error(`'${key}' is not a function`);
		}

		return maybeFn(...args);
	} as Promise<unknown> & ((...args: unknown[]) => Promise<unknown>);

	fn.then = (onFulfilled, onRejected) => property.then(onFulfilled, onRejected);
	fn.catch = (onRejected) => property.catch(onRejected);
	fn.finally = (onFinally) => property.finally(onFinally);

	return fn;
}

export function createWorkerEntrypointWrapper(
	entrypoint: string,
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
						key === 'self' ||
						typeof key === 'symbol' ||
						(DURABLE_OBJECT_KEYS as readonly string[]).includes(key)
					) {
						return;
					}

					const property = getWorkerEntrypointRpcProperty.call(
						target,
						entrypoint,
						key,
					);

					return getRpcPropertyCallableThenable(key, property);
				},
			});
		}
	}

	for (const key of WORKER_ENTRYPOINT_KEYS) {
		Wrapper.prototype[key] = async function (this: Wrapper, arg) {
			const entryPath = this.env.__VITE_ENTRY_PATH__;

			if (key === 'fetch') {
				const request = arg as Request;
				const url = new URL(request.url);

				if (url.pathname === INIT_PATH) {
					const { 0: client, 1: server } = new WebSocketPair();

					server.accept();

					createModuleRunner(this.env, server);

					return new Response(null, { status: 101, webSocket: client });
				}
			}

			const entrypointValue = await getWorkerEntrypointExport(
				entryPath,
				entrypoint,
			);
			const userEnv = stripInternalEnv(this.env);

			if (typeof entrypointValue === 'object' && entrypointValue !== null) {
				// ExportedHandler
				const maybeFn = (entrypointValue as Record<string, unknown>)[key];

				if (typeof maybeFn !== 'function') {
					throw new Error(
						`Expected ${entrypoint} export of ${entryPath} to define a \`${key}()\` function`,
					);
				}

				return maybeFn.call(entrypointValue, arg, userEnv, this.ctx);
			} else if (typeof entrypointValue === 'function') {
				// WorkerEntrypoint
				const ctor = entrypointValue as WorkerEntrypointConstructor;
				const instance = new ctor(this.ctx, userEnv);

				if (!(instance instanceof WorkerEntrypoint)) {
					throw new Error(
						`Expected ${entrypoint} export of ${entryPath} to be a subclass of \`WorkerEntrypoint\``,
					);
				}

				const maybeFn = instance[key];

				if (typeof maybeFn !== 'function') {
					throw new Error(
						`Expected ${entrypoint} export of ${entryPath} to define a \`${key}()\` method`,
					);
				}

				return (maybeFn as (arg: unknown) => unknown).call(instance, arg);
			} else {
				return new Error(
					`Expected ${entrypoint} export of ${entryPath} to be an object or a class. Got ${entrypointValue}.`,
				);
			}
		};
	}

	return Wrapper;
}
