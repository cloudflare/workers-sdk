import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		include: ["__tests__/runtime/**/*.test.ts"],
		poolOptions: {
			workers: {
				wrangler: {
					configPath: "./__tests__/runtime/wrangler.jsonc",
				},
			},
		},
	},
});
