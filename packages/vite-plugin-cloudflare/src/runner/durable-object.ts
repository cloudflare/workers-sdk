import { DurableObject } from 'cloudflare:workers';
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
	__CLOUDFLARE_WORKER_RUNNER__: DurableObjectNamespace;
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
						})
					);

					if (!response.ok) {
						return { externalize: args[0] };
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
							callback(JSON.parse(event.data));
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
					','
				)})=>{{`;
				const code = `${codeDefinition}${transformed}\n}}`;
				const fn = env.__VITE_UNSAFE_EVAL__.eval(code, id);
				await fn(...Object.values(context));
				Object.freeze(context.__vite_ssr_exports__);
			},
			async runExternalModule(file) {
				return import(file);
			},
		}
	);
}

export class CloudflareWorkerRunner extends DurableObject<RunnerEnv> {
	#runner?: ModuleRunner;
	#entrypoint?: string;

	override async fetch(request: Request) {
		const url = new URL(request.url);

		if (url.pathname === INIT_PATH) {
			if (this.#runner) {
				throw new Error('Runner already initialized');
			}

			const entry = request.headers.get('x-vite-entrypoint');

			if (!entry) {
				throw new Error('Missing x-vite-entrypoint header');
			}

			this.#entrypoint = entry;

			const pair = new WebSocketPair();

			this.ctx.acceptWebSocket(pair[0]);

			this.#runner = createModuleRunner(this.env, pair[0]);

			return new Response(null, { status: 101, webSocket: pair[1] });
		}

		if (!this.#runner || !this.#entrypoint) {
			throw new Error('Runner not initialized');
		}

		const module = await this.#runner.import(this.#entrypoint);
		const handler = module.default as ExportedHandler;

		if (!handler.fetch) {
			throw new Error('Missing fetch handler');
		}

		const {
			__VITE_ROOT__,
			__VITE_FETCH_MODULE__,
			__VITE_UNSAFE_EVAL__,
			...filteredEnv
		} = this.env;

		return handler.fetch(request, filteredEnv, this.ctx as any);
	}
}

export default {
	async fetch(request, env, ctx) {
		const durableObject = env.__CLOUDFLARE_WORKER_RUNNER__.get(
			env.__CLOUDFLARE_WORKER_RUNNER__.idFromName('')
		);
		const response = await durableObject.fetch(request);

		return response;
	},
} satisfies ExportedHandler<RunnerEnv>;
