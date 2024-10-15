import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		globalSetup: ["./test/globalSetup.ts"],
		poolOptions: {
			workers: {
				wrangler: {
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
