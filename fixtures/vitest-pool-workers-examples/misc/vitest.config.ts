import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { Response } from "miniflare";

export default defineWorkersProject({
	define: {
		CONFIG_DEFINED_THING: '"thing"',
		"CONFIG_NESTED.DEFINED.THING": "[1,2,3]",
	},
	test: {
		exclude: ["test/assets.test.ts", "test/nodejs.test.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					kvNamespaces: ["KV_NAMESPACE"],
					outboundService(request) {
						return new Response(`fallthrough:${request.method} ${request.url}`);
					},
					serviceBindings: {
						ASSETS(request) {
							return new Response(`assets:${request.method} ${request.url}`);
						},
					},
					workers: [
						{
							name: "other",
							modules: true,
							scriptPath: "./src/other-worker.mjs",
						},
					],
				},
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			},
		},
	},
});
