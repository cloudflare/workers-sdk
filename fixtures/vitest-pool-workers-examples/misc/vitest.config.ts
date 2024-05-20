import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { Response } from "miniflare";

export default defineWorkersProject({
	define: {
		CONFIG_DEFINED_THING: '"thing"',
		"CONFIG_NESTED.DEFINED.THING": "[1,2,3]",
	},
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					outboundService(request) {
						return new Response(`fallthrough:${request.method} ${request.url}`);
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
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
