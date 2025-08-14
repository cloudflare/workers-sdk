import util from "node:util";
import { defineConfig } from "vitest/config";

const debuglog = util.debuglog("@cloudflare:vite-plugin");

export default defineConfig({
	test: {
		// We run these tests one file at a time.
		// Otherwise we occasionally get flakes where two playground variants are overwriting the same files.
		fileParallelism: false,
		include: ["./**/__tests__/**/*.spec.[tj]s"],
		setupFiles: ["./vitest-setup.ts"],
		globalSetup: ["./vitest-global-setup.ts"],
		reporters: "dot",
		onConsoleLog: () => debuglog.enabled,
		testTimeout: 10000,
	},
	publicDir: false,
});
