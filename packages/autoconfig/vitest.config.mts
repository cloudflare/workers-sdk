import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 15_000,
		pool: "forks",
		include: ["**/tests/**/*.test.ts"],
		reporters: ["default"],
		unstubEnvs: true,
		mockReset: true,
	},
});
