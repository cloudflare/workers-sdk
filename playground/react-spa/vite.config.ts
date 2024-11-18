import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		react(),
		cloudflare({
			assets: {
				notFoundHandling: 'single-page-application',
			},
			persistTo: false,
		}),
	],
});
