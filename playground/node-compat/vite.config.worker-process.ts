import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist/worker-process',
	},
	plugins: [
		cloudflare({
			workers: {
				worker: {
					main: './worker-process/index.ts',
					wranglerConfig: './worker-process/wrangler.toml',
				},
			},
			entryWorker: 'worker',
			persistTo: false,
		}),
	],
});
