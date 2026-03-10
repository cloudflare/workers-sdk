import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 15_000,
		pool: "forks",
		include: ["**/tests/**/*.test.ts"],
		globalSetup: path.resolve(__dirname, "tests/vitest.global.ts"),
		reporters: ["default"],
		unstubEnvs: true,
		mockReset: true,
	},
});
