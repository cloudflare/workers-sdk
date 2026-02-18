import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
		}),
	],
	test: {},
	resolve: {
		// promjs has broken package.json (main points to lib/index.js but files are at root)
		alias: {
			promjs: path.resolve(__dirname, "node_modules/promjs/index.js"),
		},
	},
});
