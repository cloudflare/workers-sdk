import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.ts"],
		cache: false,
		root: __dirname,
		testTimeout: process.platform === "win32" ? 1000 * 60 * 20 : 1000 * 60 * 10, // 20 min for Windows, 10 min for others
		fileParallelism: false,
		globalSetup: ["global-setup.ts"],
	},
});
