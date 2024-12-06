import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist/worker-random',
	},
	plugins: [cloudflare({ configPath: './worker-random/wrangler.toml' })],
});
