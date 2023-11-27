import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			miniflare: {
				bindings: { KEY: "value" },
				singleWorker: true,
			},
		},
	},
});
