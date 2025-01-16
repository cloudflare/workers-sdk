import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/global-setup.ts"],
		exclude: [...configDefaults.exclude, "**/*.worker.test.ts"],
		testTimeout: 30_000,
	},
});
