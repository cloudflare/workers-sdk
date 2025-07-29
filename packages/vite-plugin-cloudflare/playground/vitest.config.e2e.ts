import util from "node:util";
import { defineConfig } from "vitest/config";

const debuglog = util.debuglog("@cloudflare:vite-plugin");

export default defineConfig({
	test: {
		// We run these tests in a single fork to avoid them running in parallel.
		// Otherwise we occasionally get flakes where two tests are overwriting
		// the same output files.
		poolOptions: { forks: { singleFork: true } },
		fileParallelism: false,
		include: ["./**/__tests__/**/*.spec.[tj]s"],
		setupFiles: ["./vitest-setup.ts"],
		globalSetup: ["./vitest-global-setup.ts"],
		reporters: "dot",
		onConsoleLog: () => debuglog.enabled,
		testTimeout: 100_000,
	},
	publicDir: false,
});
