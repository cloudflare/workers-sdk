import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		name: "misc-nodejs",
		include: ["test/nodejs.test.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./wrangler.nodejs.jsonc",
				},
			},
		},
	},
});
