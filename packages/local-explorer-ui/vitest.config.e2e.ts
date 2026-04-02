import { defineConfig } from "vitest/config";

export default defineConfig({
	publicDir: false,
	test: {
		fileParallelism: true,
		globalSetup: ["./src/__e2e__/global-setup.ts"],
		hookTimeout: 60_000,
		include: ["src/__e2e__/**/*.spec.ts"],
		reporters: ["dot"],
		setupFiles: ["./src/__e2e__/setup.ts"],
		testTimeout: 30_000,
	},
});
