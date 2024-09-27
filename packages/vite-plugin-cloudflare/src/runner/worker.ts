import { ModuleRunner } from 'vite/module-runner';
import { UNKNOWN_HOST, INIT_PATH } from '../shared.js';
import type { FetchResult } from 'vite/module-runner';

interface RunnerEnv {
	__VITE_ROOT__: string;
	__VITE_FETCH_MODULE__: {
		fetch: (request: Request) => Promise<Response>;
	};
	__VITE_UNSAFE_EVAL__: {
		eval: (code: string, filename: string) => Function;
	};
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
let entrypoint: string;

import { WorkerEntrypoint } from 'cloudflare:workers';

class RunnerEntrypoint extends WorkerEntrypoint<RunnerEnv> {
	constructor(ctx: ExecutionContext, env: RunnerEnv) {
		super(ctx, env);

		return new Proxy(this, {
			get(target, prop) {
				if (prop === 'fetch') {
					return async (request: Request) => {
						const url = new URL(request.url);

						if (url.pathname === INIT_PATH) {
							return target.#init.apply(target, [request]);
						}

						return target.#fetch.apply(target, [request]);
					};
				} else {
					return (...args: unknown[]) => {
						return target.#rpc.apply(target, [prop, args]);
					};
				}
			},
		});
	}

	#init(request: Request) {
		if (moduleRunner) {
			throw new Error('Runner already initialized');
		}

		const main = request.headers.get('x-vite-main');

		if (!main) {
			throw new Error('Missing x-vite-main header');
		}

		entrypoint = main;

		const { 0: client, 1: server } = new WebSocketPair();

		server.accept();

		moduleRunner = createModuleRunner(this.env, server);

		return new Response(null, { status: 101, webSocket: client });
	}

	async #fetch(request: Request) {
		if (!moduleRunner || !entrypoint) {
			throw new Error('Runner not initialized');
		}

		const {
			__VITE_ROOT__,
			__VITE_FETCH_MODULE__,
			__VITE_UNSAFE_EVAL__,
			...filteredEnv
		} = this.env;

		const module = await moduleRunner.import(entrypoint);
		const handler = module.default;

		if (typeof handler === 'function') {
			const workerEntrypoint = new handler(this.ctx, filteredEnv);

			if (!workerEntrypoint.fetch) {
				throw new Error('Missing fetch handler');
			}

			return workerEntrypoint.fetch(request);
		}

		if (!handler.fetch) {
			throw new Error('Missing fetch handler');
		}

		return handler.fetch(request, filteredEnv, this.ctx);
	}

	async #rpc(prop: string | symbol, args: unknown[]) {
		if (!moduleRunner || !entrypoint) {
			throw new Error('Runner not initialized');
		}

		const {
			__VITE_ROOT__,
			__VITE_FETCH_MODULE__,
			__VITE_UNSAFE_EVAL__,
			...filteredEnv
		} = this.env;

		const module = await moduleRunner.import(entrypoint);
		const WorkerEntrypoint = module.default;

		if (typeof WorkerEntrypoint !== 'function') {
			throw new Error('RPC error 1');
		}

		const workerEntrypoint = new WorkerEntrypoint(this.ctx, filteredEnv);

		if (!workerEntrypoint[prop]) {
			throw new Error('RPC error 2');
		}

		return workerEntrypoint[prop](...args);
	}
}

export default RunnerEntrypoint;
