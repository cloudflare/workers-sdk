import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["__tests__/**/*.test.ts"],
		exclude: ["__tests__/runtime/**/*.test.ts"],
	},
});
