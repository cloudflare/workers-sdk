import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				// Load the Worker's configuration from `cloudflare.config.ts`
				// instead of a Wrangler configuration file
				config: true,
			}),
		],
	})
);
