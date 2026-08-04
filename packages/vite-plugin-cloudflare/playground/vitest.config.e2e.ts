import util from "node:util";
import { defineConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

const debuglog = util.debuglog("@cloudflare:vite-plugin");

export default defineConfig({
	test: {
		// Inherit the repo-wide timeout and retry policy, which is sized for the
		// Windows CI runners. Spread rather than `mergeConfig()` because the latter
		// concatenates arrays, which would silently enable the shared "default"
		// reporter alongside the "dot" reporter set below.
		...configShared.test,
		// We run these tests one file at a time.
		// Otherwise we occasionally get flakes where two playground variants are overwriting the same files.
		fileParallelism: false,
		include: ["./**/__tests__/**/*.spec.[tj]s"],
		setupFiles: ["./vitest-setup.ts"],
		globalSetup: ["./vitest-global-setup.ts"],
		reporters: "dot",
		onConsoleLog: () => debuglog.enabled,
	},
	publicDir: false,
});
