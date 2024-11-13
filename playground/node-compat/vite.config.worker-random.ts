import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist/worker-random',
	},
	plugins: [
		cloudflare({
			workers: {
				worker: {
					main: './worker-random/index.ts',
					wranglerConfig: './worker-random/wrangler.toml',
				},
			},
			entryWorker: 'worker',
			persistTo: false,
		}),
	],
});
