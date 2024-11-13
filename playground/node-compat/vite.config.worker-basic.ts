import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist/worker-basic',
	},
	plugins: [
		cloudflare({
			workers: {
				worker: {
					main: './worker-basic/index.ts',
					wranglerConfig: './worker-basic/wrangler.toml',
				},
			},
			entryWorker: 'worker',
			persistTo: false,
		}),
	],
});
