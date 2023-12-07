import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			workers: {
				isolatedStorage: true,
				miniflare: {
					kvNamespaces: ["TEST_NAMESPACE"],
				},
			},
		},
	},
});
