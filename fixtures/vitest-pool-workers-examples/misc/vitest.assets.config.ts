import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				assets: {
					directory: "./public",
					binding: "ASSETS",
				},
			},
			wrangler: {
				configPath: "./wrangler.assets.jsonc",
			},
		}),
	],

	test: {
		name: "misc-assets",
		include: ["test/assets.test.ts"],
	},
});
