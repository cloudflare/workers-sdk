import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			singleWorker: true,
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
		}),
	],

	test: {
		name: "@scoped/durable-objects",
	},
});
