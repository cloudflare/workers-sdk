import * as vite from 'vite';
import { createMiddleware } from '@hattip/adapter-node';
import { createCloudflareEnvironment } from './cloudflare-environment';
import type {
	CloudflareEnvironmentOptions,
	CloudflareDevEnvironment,
} from './cloudflare-environment';

export function cloudflare(
	environments: Record<string, CloudflareEnvironmentOptions>
): vite.Plugin {
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
		configureServer(viteDevServer) {
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

					for (const target of targets) {
						if (routeMatchesUrl(target.route.path, req.url)) {
							if (target.route.rewrite && req.url) {
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

function routeMatchesUrl(route: string, url: string | undefined) {
	return url && url.startsWith(route);
}
