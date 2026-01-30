import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				isolatedStorage: false,
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			},
		},
	},
	resolve: {
		// promjs has broken package.json (main points to lib/index.js but files are at root)
		// This was reported 5 years ago and is still not fixed: https://github.com/weaveworks/promjs/issues/23
		// TODO: find a more maintained alternative to promjs
		alias: {
			promjs: path.resolve(__dirname, "node_modules/promjs/index.js"),
		},
	},
});
