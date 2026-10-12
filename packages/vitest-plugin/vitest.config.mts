import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	// `VITEST_POOL_WORKERS_DEFINE_BUILTIN_MODULES` is injected at build time by
	// `tsdown` (see `tsdown.config.ts`). Unit tests that import pool source
	// directly (e.g. `test/module-fallback.test.ts`) don't go through that build,
	// so provide an empty stub here to satisfy the reference. These tests don't
	// depend on the concrete built-in module list.
	define: {
		VITEST_POOL_WORKERS_DEFINE_BUILTIN_MODULES: "[]",
	},
	test: {
		reporters: ["default"],
		globalSetup: ["./test/global-setup.ts"],
		exclude: [...configDefaults.exclude, "**/*.worker.test.ts"],
		testTimeout: 15_000, // override this for slow tests
		hookTimeout: 60_000, // need to allow mock registry to start and install packages
		retry: 2,
	},
});
