import { defineConfig } from "vitest/config";

export default defineConfig({
	publicDir: false,
	test: {
		fileParallelism: !process.env.CI, // Parallel locally for speed & sequential in CI for stability
		globalSetup: ["./src/__e2e__/global-setup.ts"],
		hookTimeout: process.env.CI ? 120_000 : 60_000,
		include: ["src/__e2e__/**/*.spec.ts"],
		reporters: ["dot"],
		setupFiles: ["./src/__e2e__/setup.ts"],
		testTimeout: process.env.CI ? 60_000 : 30_000,
	},
});
