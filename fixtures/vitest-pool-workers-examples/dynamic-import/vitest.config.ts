import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			}),
		],
	})
);
