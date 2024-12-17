import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	environments: {
		worker_b: {
			build: {
				outDir: 'custom-output-directory',
			},
		},
	},
	plugins: [
		cloudflare({
			configPath: './worker-a/wrangler.toml',
			auxiliaryWorkers: [{ configPath: './worker-b/wrangler.toml' }],
			persistState: false,
		}),
	],
});
