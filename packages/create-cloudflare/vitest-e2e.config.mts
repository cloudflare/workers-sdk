import { defineConfig } from "vitest/config";
import { isExperimental, testPackageManager } from "./e2e/helpers/constants";
import { getLogFolder } from "./e2e/helpers/log-stream";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ["e2e/tests/**/*.test.ts"],
		testTimeout: 1000 * 60 * 10, // 10 min for lengthy installs
		setupFiles: ["e2e/helpers/to-exist.ts"],
		globalSetup: ["e2e/helpers/global-setup.ts"],
		reporters: ["json", "verbose", "hanging-process"],
		outputFile: {
			json: `${getLogFolder(isExperimental, testPackageManager)}/results.json`,
		},
	},
});
