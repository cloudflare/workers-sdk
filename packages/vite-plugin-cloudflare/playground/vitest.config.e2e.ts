import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"~utils": resolve(__dirname, "__test-utils__"),
		},
	},
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
	},
	publicDir: false,
});
