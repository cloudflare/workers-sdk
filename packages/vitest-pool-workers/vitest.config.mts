import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	// Provide the build-time define required by src/shared/builtin-modules.ts
	// when running unit tests directly against source (without a tsdown build).
	define: {
		VITEST_POOL_WORKERS_DEFINE_BUILTIN_MODULES: "[]",
	},
	test: {
		globalSetup: ["./test/global-setup.ts"],
		exclude: [...configDefaults.exclude, "**/*.worker.test.ts"],
		testTimeout: 15_000, // override this for slow tests
		hookTimeout: 60_000, // need to allow mock registry to start and install packages
		retry: 2,
	},
});
