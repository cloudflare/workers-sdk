import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist/worker-postgres',
	},
	plugins: [cloudflare({ configPath: './worker-postgres/wrangler.toml' })],
});
