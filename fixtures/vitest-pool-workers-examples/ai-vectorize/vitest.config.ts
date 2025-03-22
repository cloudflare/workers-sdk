import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: {
				allowAi: true,
				singleWorker: true,
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
});
