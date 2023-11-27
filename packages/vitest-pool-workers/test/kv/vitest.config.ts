import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			miniflare: {
				kvNamespaces: ["TEST_NAMESPACE"],
				compatibilityFlags: ["global_navigator"],
			},
		},
	},
});
