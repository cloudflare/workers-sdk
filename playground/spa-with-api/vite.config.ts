import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		react(),
		cloudflare({
			workers: {
				api: {
					main: './api/index.ts',
					wranglerConfig: './api/wrangler.toml',
					assetsBinding: 'ASSETS',
				},
			},
			entryWorker: 'api',
			assets: {
				notFoundHandling: 'single-page-application',
			},
			persistTo: false,
		}),
	],
});
