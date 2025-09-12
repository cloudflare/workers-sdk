import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				remoteBindings: false,
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
});
