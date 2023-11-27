import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			custom: {
				print: "different thing",
			},
			miniflare: {
				kvNamespaces: ["NAMESPACE"],
			},
		},
		// deps: {
		// 	external: [/cloudflare:test/],
		// },
	},
});
