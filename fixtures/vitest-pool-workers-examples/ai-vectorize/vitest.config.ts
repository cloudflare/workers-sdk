import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				remoteBindings: false,
				wrangler: { configPath: "./wrangler.jsonc" },
			}),
		],
		test: {
			globalSetup: ["./global-setup.ts"],
		},
	})
);
