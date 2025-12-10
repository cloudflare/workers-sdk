import { pool } from '@cloudflare/vitest-pool-workers';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { defineConfig } from 'vitest/config';
import { cloudflare } from '@cloudflare/vite-plugin';
export default defineWorkersConfig({
	// plugins: [cloudflare()],
	test: {
		pool: pool({
			wrangler: {
				configPath: 'v4-playground/wrangler.jsonc',
			},
		}),
		teardownTimeout: 500,
	},
});
