import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./wrangler.nodejs.jsonc",
			},
		}),
	],

	test: {
		name: "misc-nodejs",
		include: ["test/nodejs.test.ts"],
	},
});
