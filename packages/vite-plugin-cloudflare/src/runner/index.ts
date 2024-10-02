import { WorkerEntrypoint } from 'cloudflare:workers';
import { ModuleRunner } from 'vite/module-runner';
import { UNKNOWN_HOST, INIT_PATH } from '../shared.js';
import type { FetchResult } from 'vite/module-runner';

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

interface RunnerEnv {
	__VITE_ROOT__: string;
	__VITE_FETCH_MODULE__: {
		fetch: (request: Request) => Promise<Response>;
	};
	__VITE_UNSAFE_EVAL__: {
		eval: (code: string, filename: string) => Function;
	};
}

type WorkerEntrypointConstructor = {
	new (
		...args: ConstructorParameters<typeof WorkerEntrypoint>
	): WorkerEntrypoint;
};

function stripInternalEnv(internalEnv: RunnerEnv) {
	const {
		__VITE_ROOT__,
		__VITE_FETCH_MODULE__,
		__VITE_UNSAFE_EVAL__,
		...userEnv
	} = internalEnv;

	return userEnv;
}

function createModuleRunner(env: RunnerEnv, webSocket: WebSocket) {
	return new ModuleRunner(
		{
			root: env.__VITE_ROOT__,
			sourcemapInterceptor: 'prepareStackTrace',
			transport: {
				async fetchModule(...args) {
					const response = await env.__VITE_FETCH_MODULE__.fetch(
						new Request(UNKNOWN_HOST, {
							method: 'POST',
							body: JSON.stringify(args),
						}),
					);

					if (!response.ok) {
						// TODO: add error handling
					}

					const result = await response.json();

					return result as FetchResult;
				},
			},
			hmr: {
				connection: {
					isReady: () => true,
					onUpdate(callback) {
						webSocket.addEventListener('message', (event) => {
							callback(JSON.parse(event.data.toString()));
						});
					},
					send(messages) {
						webSocket.send(messages);
					},
				},
			},
		},
		{
			async runInlinedModule(context, transformed, id) {
				const codeDefinition = `'use strict';async (${Object.keys(context).join(
					',',
				)})=>{{`;
				const code = `${codeDefinition}${transformed}\n}}`;
				const fn = env.__VITE_UNSAFE_EVAL__.eval(code, id);
				await fn(...Object.values(context));
				Object.freeze(context.__vite_ssr_exports__);
			},
			async runExternalModule(file) {
				return import(file);
			},
		},
	);
}

let moduleRunner: ModuleRunner;
let mainPath: string;

async function getWorkerEntrypointExport(entrypoint: string) {
	const module = await moduleRunner.import(mainPath);
	// !!!
	console.log(mainPath, 'here');
	const entrypointValue =
		typeof module === 'object' &&
		module !== null &&
		entrypoint in module &&
		module[entrypoint];

	if (!entrypointValue) {
		throw new Error(`${mainPath} does not export a ${entrypoint} entrypoint.`);
	}

	return entrypointValue;
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

async function rpc(
	this: WorkerEntrypoint<RunnerEnv>,
	entrypoint: string,
	key: string,
) {
	const ctor = (await getWorkerEntrypointExport(
		entrypoint,
	)) as WorkerEntrypointConstructor;
	const userEnv = stripInternalEnv(this.env);

	const expectedWorkerEntrypointMessage = `Expected ${entrypoint} export of ${mainPath} to be a subclass of \`WorkerEntrypoint\` for RPC`;

	if (typeof ctor !== 'function') {
		throw new Error(expectedWorkerEntrypointMessage);
	}

	const instance = new ctor(this.ctx, userEnv);

	if (!(instance instanceof WorkerEntrypoint)) {
		throw new Error(expectedWorkerEntrypointMessage);
	}

	const property = getRpcProperty(ctor, instance, key);

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

function createWorkerEntrypointWrapper(entrypoint: string) {
	class Wrapper extends WorkerEntrypoint<RunnerEnv> {
		constructor(ctx: ExecutionContext, env: RunnerEnv) {
			super(ctx, env);

			return new Proxy(this, {
				get(target, key, receiver) {
					const value = Reflect.get(target, key, receiver);

					if (value !== undefined) {
						return value;
					}

					if (key === 'self' || typeof key === 'symbol') {
						return;
					}

					if ((DURABLE_OBJECT_KEYS as readonly string[]).includes(key)) {
						return;
					}

					// RPC
					return rpc.call(target, entrypoint, key);
				},
			});
		}
	}

	for (const key of WORKER_ENTRYPOINT_KEYS) {
		Wrapper.prototype[key] = async function (this: Wrapper, arg) {
			if (key === 'fetch') {
				const request = arg as Request;
				const url = new URL(request.url);

				if (url.pathname === INIT_PATH) {
					if (moduleRunner) {
						throw new Error('Runner already initialized');
					}

					const mainHeader = request.headers.get('x-vite-main');

					if (!mainHeader) {
						throw new Error('Missing x-vite-main header');
					}

					mainPath = mainHeader;

					const { 0: client, 1: server } = new WebSocketPair();

					server.accept();

					moduleRunner = createModuleRunner(this.env, server);

					return new Response(null, { status: 101, webSocket: client });
				}
			}

			const entrypointValue = await getWorkerEntrypointExport(entrypoint);
			const userEnv = stripInternalEnv(this.env);

			if (typeof entrypointValue === 'object' && entrypointValue !== null) {
				// ExportedHandler
				const maybeFn = (entrypointValue as Record<string, unknown>)[key];

				if (typeof maybeFn !== 'function') {
					throw new Error(
						`Expected ${entrypoint} export of ${mainPath} to define a \`${key}()\` function`,
					);
				}

				return maybeFn.call(entrypointValue, arg, userEnv, this.ctx);
			} else if (typeof entrypointValue === 'function') {
				// WorkerEntrypoint
				const ctor = entrypointValue as WorkerEntrypointConstructor;
				const instance = new ctor(this.ctx, userEnv);

				if (!(instance instanceof WorkerEntrypoint)) {
					throw new Error(
						`Expected ${entrypoint} export of ${mainPath} to be a subclass of \`WorkerEntrypoint\``,
					);
				}

				const maybeFn = instance[key];

				if (typeof maybeFn !== 'function') {
					throw new Error(
						`Expected ${entrypoint} export of ${mainPath} to define a \`${key}()\` method`,
					);
				}

				return (maybeFn as (arg: unknown) => unknown).call(instance, arg);
			} else {
				return new Error(
					`Expected ${entrypoint} export of ${mainPath} to be an object or a class. Got ${entrypointValue}.`,
				);
			}
		};
	}

	return Wrapper;
}

export default createWorkerEntrypointWrapper('default') as any;
