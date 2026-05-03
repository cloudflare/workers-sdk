import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				miniflare: {
					// Required to use `exports.default.scheduled()`. This is an experimental
					// compatibility flag, and cannot be enabled in production.
					compatibilityFlags: [
						"service_binding_extra_handlers",
						"nodejs_compat",
					],
				},
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			}),
		],
	})
);
