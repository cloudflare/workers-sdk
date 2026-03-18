import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			main: "src/index.ts",
			miniflare: {
				compatibilityDate: "2025-02-04",
				durableObjects: {
					ENGINE: {
						className: "Engine",
						useSQLite: true,
					},
				},
			},
		}),
	],
});
