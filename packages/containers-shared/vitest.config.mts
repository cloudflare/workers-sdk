import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 15_000,
		retry: 0,
		include: ["**/tests/**/*.test.ts"],
		globals: true,
	},
});
