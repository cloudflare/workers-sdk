// import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// export default defineWorkersConfig({
// 	test: {
// 		poolOptions: {
// 			workers: {
// 				main: './src/index.ts',
// 				miniflare: {
// 					compatibilityDate: '2025-12-02',
// 					compatibilityFlags: ['nodejs_compat'],
// 				},
// 			},
// 		},
// 	},
// });

// import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
// import { cloudflarePool } from '@cloudflare/vitest-pool-workers';

// export default defineWorkersConfig({
// 	test: {
// 		pool: cloudflarePool({
// 			main: './src/index.ts',
// 			miniflare: {
// 				compatibilityDate: '2025-12-02',
// 				compatibilityFlags: ['nodejs_compat'],
// 			},
// 		}),
// 	},
// });

import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	plugins: [
		cloudflareTest({
			main: './src/index.ts',
			miniflare: {
				compatibilityDate: '2025-12-02',
				compatibilityFlags: ['nodejs_compat'],
			},
		}),
	],
	test: {
		teardownTimeout: 500,
	},
});
