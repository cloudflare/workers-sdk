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
						})
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

let moduleRunner: ModuleRunner;
let entrypoint: string;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === INIT_PATH) {
			if (moduleRunner) {
				throw new Error('Runner already initialized');
			}

			const entry = request.headers.get('x-vite-entrypoint');

			if (!entry) {
				throw new Error('Missing x-vite-entrypoint header');
			}

			entrypoint = entry;

			const { 0: client, 1: server } = new WebSocketPair();

			server.accept();

			moduleRunner = createModuleRunner(env, server);

			return new Response(null, { status: 101, webSocket: client });
		}

		if (!moduleRunner || !entrypoint) {
			throw new Error('Runner not initialized');
		}

		const module = await moduleRunner.import(entrypoint);
		const handler = module.default as ExportedHandler;

		if (!handler.fetch) {
			throw new Error('Missing fetch handler');
		}

		const {
			__VITE_ROOT__,
			__VITE_FETCH_MODULE__,
			__VITE_UNSAFE_EVAL__,
			...filteredEnv
		} = env;

		return handler.fetch(request, filteredEnv, ctx);
	},
} satisfies ExportedHandler<RunnerEnv>;
