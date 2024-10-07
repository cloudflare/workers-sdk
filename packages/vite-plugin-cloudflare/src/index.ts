import * as vite from 'vite';
import { createMiddleware } from '@hattip/adapter-node';
import { Miniflare, Response as MiniflareResponse } from 'miniflare';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { createCloudflareEnvironment } from './cloudflare-environment';
import type { FetchFunctionOptions } from 'vite/module-runner';
import type { WorkerOptions } from 'miniflare';
import type {
	CloudflareEnvironmentOptions,
	CloudflareDevEnvironment,
} from './cloudflare-environment';

const wrapperPath = '__VITE_WRAPPER_PATH__';
const runnerPath = fileURLToPath(new URL('./runner/index.js', import.meta.url));

export function cloudflare<
	T extends Record<string, CloudflareEnvironmentOptions>,
>(pluginConfig: { workers: T; entryWorker?: keyof T }): vite.Plugin {
	let viteConfig: vite.ResolvedConfig;

	return {
		name: 'vite-plugin-cloudflare',
		config() {
			return {
				environments: Object.fromEntries(
					Object.entries(pluginConfig.workers).map(([name, options]) => {
						return [name, createCloudflareEnvironment(options)];
					}),
				),
			};
		},
		configResolved(resolvedConfig) {
			viteConfig = resolvedConfig;
		},
		async configureServer(viteDevServer) {
			const workers = Object.entries(pluginConfig.workers).map(
				([name, options]) => {
					const miniflareOptions = unstable_getMiniflareWorkerOptions(
						path.resolve(
							viteConfig.root,
							options.wranglerConfig ?? './wrangler.toml',
						),
					);

					const { ratelimits, ...workerOptions } =
						miniflareOptions.workerOptions;

					return {
						...workerOptions,
						name,
						modulesRoot: '/',
						unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
						bindings: {
							...workerOptions.bindings,
							__VITE_ROOT__: viteConfig.root,
							__VITE_ENTRY_PATH__: options.main,
						},
					} satisfies Partial<WorkerOptions>;
				},
			);

			const workerEntrypointNames = Object.fromEntries(
				workers.map((workerOptions) => [workerOptions.name, new Set<string>()]),
			);

			for (const worker of workers) {
				if (worker.serviceBindings === undefined) {
					continue;
				}

				for (const value of Object.values(worker.serviceBindings)) {
					if (
						typeof value === 'object' &&
						'name' in value &&
						typeof value.name === 'string' &&
						value.entrypoint !== undefined &&
						value.entrypoint !== 'default'
					) {
						workerEntrypointNames[value.name]?.add(value.entrypoint);
					}
				}
			}

			const miniflare = new Miniflare({
				workers: workers.map((workerOptions) => {
					const wrappers = [
						`import { createWorkerEntrypointWrapper } from '${runnerPath}';`,
						`export default createWorkerEntrypointWrapper('default');`,
					];

					for (const entrypointName of [
						...(workerEntrypointNames[workerOptions.name] ?? []),
					].sort()) {
						wrappers.push(
							`export const ${entrypointName} = createWorkerEntrypointWrapper('${entrypointName}');`,
						);
					}

					return {
						...workerOptions,
						modules: [
							{
								type: 'ESModule',
								path: wrapperPath,
								contents: wrappers.join('\n'),
							},
							{
								type: 'ESModule',
								path: runnerPath,
							},
						],
						serviceBindings: {
							...workerOptions.serviceBindings,
							__VITE_FETCH_MODULE__: async (request) => {
								const args = (await request.json()) as [
									string,
									string,
									FetchFunctionOptions,
								];

								const devEnvironment = viteDevServer.environments[
									workerOptions.name
								] as CloudflareDevEnvironment;

								try {
									const result = await devEnvironment.fetchModule(...args);

									return new MiniflareResponse(JSON.stringify(result));
								} catch (error) {
									// TODO: check error handling
									const result = {
										externalize: args[0],
										type: 'builtin',
									} satisfies vite.FetchResult;

									return new MiniflareResponse(JSON.stringify(result));
								}
							},
						},
					};
				}),
			});

			await Promise.all(
				workers.map(async (workerOptions) => {
					const worker = await miniflare.getWorker(workerOptions.name);

					return (
						viteDevServer.environments[
							workerOptions.name
						] as CloudflareDevEnvironment
					).initRunner(worker);
				}),
			);

			const middleware =
				pluginConfig.entryWorker &&
				createMiddleware(
					(context) => {
						return (
							viteDevServer.environments[
								pluginConfig.entryWorker as string
							] as CloudflareDevEnvironment
						).dispatchFetch(context.request);
					},
					{ alwaysCallNext: false },
				);

			return () => {
				viteDevServer.middlewares.use((req, res, next) => {
					req.url = req.originalUrl;

					if (!middleware) {
						next();
						return;
					}

					middleware(req, res, next);
				});
			};
		},
	};
}
