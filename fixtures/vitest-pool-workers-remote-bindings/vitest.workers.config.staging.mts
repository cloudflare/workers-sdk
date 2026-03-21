import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.json", environment: "staging" },
		}),
	],
	test: {
		include: ["test-staging/**/*.spec.ts"],
		server: {
			deps: {
				external: [
					/packages\/vitest-pool-workers\/dist/,
					/packages\/wrangler\//,
				],
			},
		},
	},
});
