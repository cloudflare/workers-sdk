import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				// Required to use `SELF.scheduled()`. This is an experimental
				// compatibility flag, and cannot be enabled in production.
				compatibilityFlags: ["service_binding_extra_handlers"],
			},
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
		}),
	],

	test: {},
});
