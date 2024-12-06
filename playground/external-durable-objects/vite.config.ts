import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		cloudflare({
			wranglerConfig: './worker-a/wrangler.toml',
			auxiliaryWorkers: [{ wranglerConfig: './worker-b/wrangler.toml' }],
		}),
	],
});
