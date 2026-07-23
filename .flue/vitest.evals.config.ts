import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["src/evals/global-setup.ts"],
		include: ["src/evals/**/*.eval.ts"],
		reporters: ["default", "vitest-evals/reporter"],
		testTimeout: 60_000,
	},
});
