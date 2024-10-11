import { defineConfig } from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';

export default defineConfig({
	plugins: [
		cloudflare({
			workers: {
				worker: {
					main: './worker/index.ts',
					wranglerConfig: './worker/wrangler.toml',
				},
			},
			entryWorker: 'worker',
		}),
	],
});
