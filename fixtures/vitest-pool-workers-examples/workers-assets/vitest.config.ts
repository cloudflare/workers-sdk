import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
				miniflare: {
					assets: {
						directory: "./public",
						binding: "ASSETS",
						assetConfig: {
							not_found_handling: "none",
							html_handling: "auto-trailing-slash",
						},
					},
				},
			},
		},
	},
});
