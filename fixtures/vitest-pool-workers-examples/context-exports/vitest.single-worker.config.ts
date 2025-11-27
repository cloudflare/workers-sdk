import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { auxiliaryWorker } from "./vitest.config";

export default defineWorkersProject({
	test: {
		name: "context-exports-single-worker",
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: { configPath: "./src/wrangler.jsonc" },
				miniflare: {
					workers: [auxiliaryWorker],
				},
			},
		},
	},
});
