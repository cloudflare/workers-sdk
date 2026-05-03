import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
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
	})
);
