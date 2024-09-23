import { defineConfig } from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';

export default defineConfig({
	plugins: [
		cloudflare({
			workerA: {
				entrypoint: './src/worker-a.ts',
				route: { path: '/worker-a' },
			},
			workerB: {
				entrypoint: './src/worker-b.ts',
				route: { path: '/worker-b' },
			},
		}),
	],
});
