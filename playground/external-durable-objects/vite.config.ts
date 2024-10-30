import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		cloudflare({
			workers: {
				worker_a: {
					main: './worker-a/index.ts',
					wranglerConfig: './worker-a/wrangler.toml',
				},
				worker_b: {
					main: './worker-b/index.ts',
					wranglerConfig: './worker-b/wrangler.toml',
				},
			},
			entryWorker: 'worker_b',
			persistTo: false,
		}),
	],
});
