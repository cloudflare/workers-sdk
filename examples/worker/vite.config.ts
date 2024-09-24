import { defineConfig } from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';

export default defineConfig({
	plugins: [
		cloudflare({
			workerA: {
				entrypoint: './worker-a/index.ts',
				route: { path: '/worker-a' },
				wranglerConfig: './worker-a/wrangler.toml',
			},
			workerB: {
				entrypoint: './worker-b/index.ts',
				route: { path: '/worker-b' },
				wranglerConfig: './worker-b/wrangler.toml',
			},
		}),
	],
});
