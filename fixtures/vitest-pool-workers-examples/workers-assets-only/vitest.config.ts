import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
				miniflare: {
					assets: {
						directory: "./public",
						assetConfig: {
							html_handling: "none",
						},
					},
				},
			},
		},
	},
});
