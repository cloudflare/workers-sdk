import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	esbuild: {
		// Required for `using` support
		target: "ES2022",
	},
	test: {
		name: "@scoped/workflows",
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			},
		},
	},
});
