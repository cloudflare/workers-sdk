import { ModuleRunner } from 'vite/module-runner';
import { UNKNOWN_HOST } from '../shared';
import type { FetchResult } from 'vite/module-runner';
import type { WrapperEnv } from './env';

let moduleRunner: ModuleRunner;

export function createModuleRunner(env: WrapperEnv, webSocket: WebSocket) {
	if (moduleRunner) {
		throw new Error('Runner already initialized');
	}

	moduleRunner = new ModuleRunner(
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
					send(payload) {
						webSocket.send(JSON.stringify(payload));
					},
				},
			},
		},
		{
			async runInlinedModule(context, transformed, module) {
				const codeDefinition = `'use strict';async (${Object.keys(context).join(
					',',
				)})=>{{`;
				const code = `${codeDefinition}${transformed}\n}}`;
				const fn = env.__VITE_UNSAFE_EVAL__.eval(code, module.id);
				await fn(...Object.values(context));
				Object.freeze(context.__vite_ssr_exports__);
			},
			async runExternalModule(file) {
				return import(file);
			},
		},
	);
}

export async function getWorkerEntrypointExport(
	path: string,
	entrypoint: string,
) {
	const module = await moduleRunner.import(path);
	const entrypointValue =
		typeof module === 'object' &&
		module !== null &&
		entrypoint in module &&
		module[entrypoint];

	if (!entrypointValue) {
		throw new Error(`${path} does not export a ${entrypoint} entrypoint.`);
	}

	return entrypointValue;
}
