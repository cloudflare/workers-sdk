import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 120_000,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		retry: 2,
		include: ["**/__tests__/**/*.test.ts"],
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		outputFile: process.env.TEST_REPORT_PATH ?? ".test-report/index.html",
		// globalSetup: path.resolve(__dirname, "./validate-environment.ts"),
		reporters: ["verbose", "html"],
	},
});
