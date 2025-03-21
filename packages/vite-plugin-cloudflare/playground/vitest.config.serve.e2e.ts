import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["./**/__tests__/**/*.spec.[tj]s"],
		setupFiles: ["./vitest-setup.ts"],
		globalSetup: ["./vitest-global-setup.ts"],
		reporters: "dot",
		onConsoleLog: () => false,
		testTimeout: 10000,
	},
	publicDir: false,
});
