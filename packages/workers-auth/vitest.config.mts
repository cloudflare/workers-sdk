import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 15_000,
		pool: "forks",
		include: ["**/tests/**/*.test.ts"],
		globalSetup: path.resolve(import.meta.dirname, "tests/vitest.global.ts"),
		setupFiles: [path.resolve(import.meta.dirname, "tests/vitest.setup.ts")],
		reporters: ["default"],
		unstubEnvs: true,
		mockReset: true,
	},
});
