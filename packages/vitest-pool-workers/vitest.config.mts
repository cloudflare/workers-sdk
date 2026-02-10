import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/global-setup.ts"],
		exclude: [...configDefaults.exclude, "**/*.worker.test.ts"],
		testTimeout: 15_000, // override this for slow tests
		hookTimeout: 60_000, // need to allow mock registry to start and install packages
		retry: 2,
	},
});
