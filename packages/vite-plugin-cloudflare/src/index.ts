import * as vite from 'vite';
import { createMiddleware } from '@hattip/adapter-node';
import { createCloudflareEnvironment } from './cloudflare-environment';
import type {
	CloudflareEnvironmentOptions,
	CloudflareDevEnvironment,
} from './cloudflare-environment';

export function cloudflare(options: CloudflareEnvironmentOptions): vite.Plugin {
	return {
		name: 'vite-plugin-cloudflare',
		config() {
			return {
				environments: {
					worker: createCloudflareEnvironment(options),
				},
			};
		},
		configureServer(viteDevServer) {
			const middleware = createMiddleware(
				(context) => {
					return (
						viteDevServer.environments.worker as CloudflareDevEnvironment
					).dispatchFetch(context.request);
				},
				{ alwaysCallNext: false }
			);

			return () => {
				viteDevServer.middlewares.use((req, res, next) => {
					req.url = req.originalUrl;
					middleware(req, res, next);
				});
			};
		},
	};
}
