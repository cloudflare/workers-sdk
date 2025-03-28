import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	esbuild: {
		// Required for `using` support
		target: "ES2022",
	},
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				// FIXME(lduarte): currently for the workflow binding to work, isolateStorage must be disabled.
				isolatedStorage: false,
				wrangler: {
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
