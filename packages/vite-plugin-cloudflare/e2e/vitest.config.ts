import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.ts"],
		cache: false,
		root: __dirname,
		testTimeout: 1000 * 60 * 10, // 10 min for lengthy installs
		fileParallelism: false,
		globalSetup: ["global-setup.ts"],
	},
});
