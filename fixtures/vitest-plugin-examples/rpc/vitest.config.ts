import { cloudflareTest } from "@cloudflare/vitest-plugin";
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
					// `nodejs_compat` is not listed here because the inferred compatibility
					// date enables it by default, and specifying it would be an error.
					compatibilityFlags: ["service_binding_extra_handlers"],
				},
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			}),
		],
	})
);
