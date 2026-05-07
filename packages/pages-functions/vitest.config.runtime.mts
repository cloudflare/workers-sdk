import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./__tests__/runtime/wrangler.jsonc",
			},
		}),
	],
	test: {
		include: ["__tests__/runtime/**/*.test.ts"],
	},
});
