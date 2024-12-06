import { resolve } from 'node:path';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	resolve: {
		alias: {
			'@alias/test': resolve(__dirname, './src/aliasing.ts'),
		},
	},
	build: {
		rollupOptions: {
			// let's externalize this non existing package just to make the build command pass
			// (so that we can validate the dev user error for trying to import it)
			external: ['@non-existing/pkg'],
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
