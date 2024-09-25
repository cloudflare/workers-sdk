import { defineConfig } from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';

export default defineConfig({
	plugins: [
		cloudflare({
			environments: {
				worker_a: {
					main: './worker-a/index.ts',
					wranglerConfig: './worker-a/wrangler.toml',
				},
				worker_b: {
					main: './worker-b/index.ts',
					wranglerConfig: './worker-b/wrangler.toml',
				},
			},
			entrypoint: 'worker_a',
		}),
	],
});
