import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				compatibilityDate: "2025-02-04",
			},
		}),
	],
	test: {
		// The published plugin cannot read Vitest's host filesystem module cache.
		fsModuleCache: false,
		reporters: ["default"],
		testTimeout: 50_000,
	},
});
