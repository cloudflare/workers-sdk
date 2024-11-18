import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		cloudflare({
			assets: {
				htmlHandling: 'auto-trailing-slash',
				notFoundHandling: '404-page',
			},
			persistTo: false,
		}),
	],
});
