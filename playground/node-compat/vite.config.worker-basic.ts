import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist/worker-basic',
	},
	plugins: [cloudflare({ configPath: './worker-basic/wrangler.toml' })],
});
