import { defineConfig } from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';

export default defineConfig({
	plugins: [
		cloudflare({
			environments: {
				workerA: {
					main: './worker-a/index.ts',
					wranglerConfig: './worker-a/wrangler.toml',
				},
				workerB: {
					main: './worker-b/index.ts',
					wranglerConfig: './worker-b/wrangler.toml',
				},
			},
			entrypoint: 'workerA',
		}),
	],
});
