import { defineConfig } from 'vite';
import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';

export default defineConfig({
	plugins: [cloudflare({ entrypoint: './src/worker.ts' })],
});
