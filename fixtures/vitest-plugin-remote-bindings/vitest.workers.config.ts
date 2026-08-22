import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.json" },
		}),
	],
	test: {
		reporters: ["default"],
		include: ["test/**/*.spec.ts"],
		server: {
			deps: {
				external: [/packages\/vitest-plugin\/dist/, /packages\/wrangler\//],
			},
		},
	},
});
