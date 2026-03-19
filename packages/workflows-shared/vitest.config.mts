import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
});
