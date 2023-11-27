import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			custom: {
				print: "mything",
			},
			miniflare: {
				bindings: { KEY: "value" },
			},
		},
	},
});
