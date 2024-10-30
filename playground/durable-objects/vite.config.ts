import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

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
			persistTo: false,
		}),
	],
});
