import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				config: true,
				miniflare: {
					// `cloudflare.config.ts` doesn't set the assets directory
					assets: { directory: "./public" },
				},
			}),
		],
	})
);
