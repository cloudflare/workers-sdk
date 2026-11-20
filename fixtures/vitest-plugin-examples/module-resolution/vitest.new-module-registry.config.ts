import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				config: "./cloudflare.new-module-registry.config.ts",
			}),
		],
		test: { name: "module-resolution-new-module-registry" },
	})
);
