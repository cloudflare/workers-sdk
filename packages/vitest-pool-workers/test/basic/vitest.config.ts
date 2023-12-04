import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					bindings: { KEY: "value" },
				},
			},
		},
	},
});
