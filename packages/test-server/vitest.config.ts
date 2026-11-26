import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/__tests__/**/*.test.ts"],
		reporters: ["default"],
		// Each test starts workerd through Miniflare
		testTimeout: 30_000,
	},
});
