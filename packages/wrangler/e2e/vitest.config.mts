import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 90_000,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		include: [process.env.WRANGLER_E2E_TEST_FILE || "e2e/**/*.test.ts"],
		outputFile: process.env.TEST_REPORT_PATH ?? ".e2e-test-report/index.html",
		globalSetup: path.resolve(__dirname, "./validate-environment.ts"),
		reporters: ["verbose", "html"],
		bail: 1,
		chaiConfig: {
			// this controls how much output is shown when expect(string).toContain(...) fails
			// the default results in a very short, unhelpful string whereas we would like to
			// see the full string to help figure out why the assertion failed
			truncateThreshold: 1e6,
		},
		setupFiles: ["./e2e/vitest.setup.ts"],
	},
});
