import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.json" },
		}),
	],
	test: {
		include: ["test/**/*.spec.ts"],
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
