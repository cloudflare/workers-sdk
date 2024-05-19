import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 120_000,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		retry: 0,
		include: ["**/__tests__/**/*.test.ts"],
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		outputFile: process.env.TEST_REPORT_PATH ?? ".test-report/index.html",
		setupFiles: path.resolve(__dirname, "src/__tests__/vitest.setup.ts"),
		reporters: ["verbose", "html"],
	},
});
