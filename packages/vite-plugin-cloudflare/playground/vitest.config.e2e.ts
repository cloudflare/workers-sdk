import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// We run these tests in a single fork to avoid them running in parallel.
		// Otherwise we occasionally get flakes where two tests are overwriting
		// the same output files.
		poolOptions: { forks: { singleFork: true } },
		include: ["./**/__tests__/**/*.spec.[tj]s"],
		setupFiles: ["./vitest-setup.ts"],
		globalSetup: ["./vitest-global-setup.ts"],
		reporters: "dot",
		onConsoleLog: () => false,
		testTimeout: 10000,
	},
	publicDir: false,
});
