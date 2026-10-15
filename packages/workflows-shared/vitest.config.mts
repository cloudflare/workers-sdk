import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			// The published plugin cannot read Vitest's host filesystem module cache.
			fsModuleCache: false,
		},
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
