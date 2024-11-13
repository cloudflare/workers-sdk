import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist/worker-postgres',
	},
	plugins: [
		cloudflare({
			workers: {
				worker: {
					main: './worker-postgres/index.ts',
					wranglerConfig: './worker-postgres/wrangler.toml',
				},
			},
			entryWorker: 'worker',
			persistTo: false,
		}),
	],
});
