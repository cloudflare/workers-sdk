import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				compatibilityDate: "2025-01-01",
			},
		}),
	],
	test: {
		testTimeout: 50_000,
	},
});
