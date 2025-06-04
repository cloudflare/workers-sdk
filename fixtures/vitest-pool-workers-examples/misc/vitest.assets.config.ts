import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		name: "misc-assets",
		include: ["test/assets.test.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					assets: {
						directory: "./public",
						binding: "ASSETS",
					},
				},
				wrangler: {
					configPath: "./wrangler.assets.jsonc",
				},
			},
		},
	},
});
