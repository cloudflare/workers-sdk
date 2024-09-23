import * as vite from 'vite';
import { createMiddleware } from '@hattip/adapter-node';
import { Miniflare, Response as MiniflareResponse } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { createCloudflareEnvironment } from './cloudflare-environment';
import type { FetchFunctionOptions } from 'vite/module-runner';
import type {
	CloudflareEnvironmentOptions,
	CloudflareDevEnvironment,
} from './cloudflare-environment';

const runnerPath = fileURLToPath(import.meta.resolve('./runner/worker.js'));

export function cloudflare(
	environments: Record<string, CloudflareEnvironmentOptions>
): vite.Plugin {
	let resolvedConfig: vite.ResolvedConfig;

	return {
		name: 'vite-plugin-cloudflare',
		config() {
			return {
				environments: Object.fromEntries(
					Object.entries(environments).map(([name, options]) => {
						return [name, createCloudflareEnvironment(options)];
					})
				),
			};
		},
		configResolved(config) {
			resolvedConfig = config;
		},
		async configureServer(viteDevServer) {
			const miniflare = new Miniflare({
				workers: Object.entries(environments).map(([name, options]) => {
					return {
						// ...workerOptions
						name,
						modulesRoot: '/',
						modules: [
							{
								type: 'ESModule',
								path: runnerPath,
							},
						],
						unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
						bindings: {
							// ...bindings,
							__VITE_ROOT__: resolvedConfig.root,
						},
						serviceBindings: {
							// ...serviceBindings
							__VITE_FETCH_MODULE__: async (request) => {
								const args = (await request.json()) as [
									string,
									string,
									FetchFunctionOptions
								];

								const devEnvironment = viteDevServer.environments[
									name
								] as CloudflareDevEnvironment;

								try {
									const result = await devEnvironment.fetchModule(...args);

									return new MiniflareResponse(JSON.stringify(result));
								} catch (error) {
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
				Object.keys(environments).map((name) =>
					(
						viteDevServer.environments[name] as CloudflareDevEnvironment
					).initRunner(miniflare)
				)
			);

			const targets = Object.entries(environments)
				.filter(([_, options]) => options.route)
				.map(([name, options]) => {
					return {
						route: options.route!,
						middleware: createMiddleware((context) => {
							return (
								viteDevServer.environments[name] as CloudflareDevEnvironment
							).dispatchFetch(context.request);
						}),
					};
				});

			return () => {
				viteDevServer.middlewares.use((req, res, next) => {
					req.url = req.originalUrl;

					if (!req.url) return;

					for (const target of targets) {
						if (routeMatchesUrl(target.route.path, req.url)) {
							if (target.route.rewrite) {
								req.url = target.route.rewrite(req.url);
							}

							target.middleware(req, res, next);

							return;
						}
					}

					next();
				});
			};
		},
	};
}

function routeMatchesUrl(route: string, url: string) {
	return url && url.startsWith(route);
}
