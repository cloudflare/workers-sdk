import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.disabled.jsonc" },
			}),
		],
		test: {
			include: ["test/container-disabled.test.ts"],
			name: "container-app-disabled",
		},
	})
);
