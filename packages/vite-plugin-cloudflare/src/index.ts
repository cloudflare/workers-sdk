import * as vite from 'vite';
import { createMiddleware } from '@hattip/adapter-node';
import { Miniflare, Response as MiniflareResponse } from 'miniflare';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createCloudflareEnvironment } from './cloudflare-environment';
import {
	getWorkerToWorkerEntrypointNamesMap,
	getWorkerToDurableObjectClassNamesMap,
} from './utils';
import { getResolveId, getModuleFallbackHandler } from './module-fallback';
import { WORKERD_CUSTOM_IMPORT_PATH, invariant } from './shared';
import type { FetchFunctionOptions } from 'vite/module-runner';
import type { WorkerOptions } from 'miniflare';
import type {
	CloudflareEnvironmentOptions,
	CloudflareDevEnvironment,
} from './cloudflare-environment';

// We want module names to be their absolute path without the leading slash
// (i.e. the modules root should be the root directory). On Windows, we need
// paths to include the drive letter (i.e. `C:/a/b/c/index.mjs`).
// Internally, Miniflare uses `path.relative(modulesRoot, path)` to compute
// module names. Setting `modulesRoot` to a drive letter and prepending this
// to paths ensures correct names. This requires us to specify `contents` in
// the miniflare module definitions though, as the new paths don't exist.
const miniflareModulesRoot = process.platform === 'win32' ? 'Z:\\' : '/';
const WRAPPER_PATH = '__VITE_WORKER_ENTRY__';
const RUNNER_PATH = './runner/index.js';

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
						modulesRoot: miniflareModulesRoot,
						unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
						bindings: {
							...workerOptions.bindings,
							__VITE_ROOT__: viteConfig.root,
							__VITE_ENTRY_PATH__: options.main,
						},
					} satisfies Partial<WorkerOptions>;
				},
			);

			const workerToWorkerEntrypointNamesMap =
				getWorkerToWorkerEntrypointNamesMap(workers);
			const workerToDurableObjectClassNamesMap =
				getWorkerToDurableObjectClassNamesMap(workers);

			// TODO: we only have a single module resolution strategy shared across all workers
			//       (generated using the first worker's dev environment)
			//       we should investigate and ideally have potential different resolutions per worker
			//       see: https://github.com/flarelabs-net/vite-plugin-cloudflare/issues/19
			const firstWorkerName = workers[0]?.name;
			invariant(firstWorkerName, 'First worker name not found');
			const devEnvironment = viteDevServer.environments[firstWorkerName];
			invariant(devEnvironment, 'First worker dev environment not found');
			const resolveId = getResolveId(viteConfig, devEnvironment);

			const miniflare = new Miniflare({
				workers: workers.map((workerOptions) => {
					const wrappers = [
						`import { createWorkerEntrypointWrapper, createDurableObjectWrapper } from '${RUNNER_PATH}';`,
						`export default createWorkerEntrypointWrapper('default');`,
					];

					const entrypointNames = workerToWorkerEntrypointNamesMap.get(
						workerOptions.name,
					);
					invariant(
						entrypointNames,
						`WorkerEntrypoint names not found for worker ${workerOptions.name}`,
					);

					for (const entrypointName of [...entrypointNames].sort()) {
						wrappers.push(
							`export const ${entrypointName} = createWorkerEntrypointWrapper('${entrypointName}');`,
						);
					}

					const classNames = workerToDurableObjectClassNamesMap.get(
						workerOptions.name,
					);
					invariant(
						classNames,
						`DurableObject class names not found for worker ${workerOptions.name}`,
					);

					for (const className of [...classNames].sort()) {
						wrappers.push(
							`export const ${className} = createDurableObjectWrapper('${className}');`,
						);
					}

					return {
						...workerOptions,
						unsafeUseModuleFallbackService: true,
						modules: [
							{
								type: 'ESModule',
								path: path.join(miniflareModulesRoot, WRAPPER_PATH),
								contents: wrappers.join('\n'),
							},
							{
								type: 'ESModule',
								path: path.join(miniflareModulesRoot, RUNNER_PATH),
								contents: fs.readFileSync(
									fileURLToPath(new URL(RUNNER_PATH, import.meta.url)),
								),
							},
							{
								// Declared as a CommonJS module so that `require` is made available and we are able to handle cjs imports
								type: 'CommonJS',
								path: path.join(
									miniflareModulesRoot,
									WORKERD_CUSTOM_IMPORT_PATH,
								),
								contents: 'module.exports = path => import(path)',
							},
						],
						serviceBindings: {
							...workerOptions.serviceBindings,
							__VITE_FETCH_MODULE__: async (request) => {
								const [moduleId, imported, options] =
									(await request.json()) as [
										string,
										string,
										FetchFunctionOptions,
									];

								const devEnvironment = viteDevServer.environments[
									workerOptions.name
								] as CloudflareDevEnvironment;

								try {
									const result = await devEnvironment.fetchModule(
										moduleId,
										imported,
										options,
									);

									return new MiniflareResponse(JSON.stringify(result));
								} catch (error) {
									if (moduleId.startsWith('cloudflare:')) {
										const result = {
											externalize: moduleId,
											type: 'module',
										} satisfies vite.FetchResult;

										return new MiniflareResponse(JSON.stringify(result));
									}
									throw new Error(
										`Unexpected Error, failed to get module: ${moduleId}`,
									);
								}
							},
						},
					};
				}),
				unsafeModuleFallbackService: getModuleFallbackHandler(resolveId),
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
