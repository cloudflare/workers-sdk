import { resolve } from 'node:path';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	resolve: {
		alias: {
			'@alias/test': resolve(__dirname, './src/aliasing.ts'),
		},
	},
	environments: {
		worker: {
			optimizeDeps: {
				// we specifically opt-out of prebundling for the following dependencies
				exclude: ['@cloudflare-dev-module-resolution/requires', 'react'],
			},
			resolve: {
				// external modules don't get prebundled
				external: ['@cloudflare-dev-module-resolution/requires/ext'],
			},
		},
	},
	plugins: [cloudflare({ viteEnvironmentName: 'worker' })],
});
