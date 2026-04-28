import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		plugins: [
			cloudflareTest({
				miniflare: {
					compatibilityFlags: ["service_binding_extra_handlers"],
				},
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			}),
		],
	})
);
