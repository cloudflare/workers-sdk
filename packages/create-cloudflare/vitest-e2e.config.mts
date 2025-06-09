import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// These are the environment variables (and their defaults) that are used in the e2e tests.
process.env.E2E_EXPERIMENTAL ??= "false";
process.env.E2E_TEST_PM ??= "pnpm";
process.env.E2E_NO_DEPLOY ??= "true";

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
	test: {
		include: ["e2e/tests/**/*.test.ts"],
		testTimeout: 1000 * 60 * 10, // 10 min for lengthy installs
		globalSetup: ["e2e/helpers/global-setup.ts"],
		reporters: ["json", "verbose", "hanging-process"],
		outputFile: {
			json: `./.e2e-logs${process.env.E2E_EXPERIMENTAL === "true" ? "-experimental" : ""}/${process.env.E2E_TEST_PM}/results.json`,
		},
	},
});
