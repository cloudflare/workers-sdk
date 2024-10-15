import { defineConfig } from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';

export default defineConfig({
	plugins: [
		cloudflare({
			workers: {
				worker: {
					main: './src/index.ts',
					wranglerConfig: './src/wrangler.toml',
				},
			},
			entryWorker: 'worker',
		}),
	],
});
