import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 50_000,
		pool: "forks",
		retry: 0,
		include: ["**/__tests__/**/*.test.ts"],
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		outputFile: process.env.TEST_REPORT_PATH ?? ".e2e-test-report/index.html",
		setupFiles: path.resolve(__dirname, "src/__tests__/vitest.setup.ts"),
		reporters: ["default", "html"],
		globals: true,
		snapshotFormat: {
			escapeString: true,
			printBasicPrototype: true,
		},
		snapshotSerializers: ["src/__tests__/helpers/jest-error-snapshot.ts"],
	},
});
