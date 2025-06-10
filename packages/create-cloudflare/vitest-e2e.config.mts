import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { isExperimental, testPackageManager } from "./e2e/helpers/constants";

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
	test: {
		include: ["e2e/tests/**/*.test.ts"],
		testTimeout: 1000 * 60 * 10, // 10 min for lengthy installs
		globalSetup: ["e2e/helpers/global-setup.ts"],
		reporters: ["json", "verbose", "hanging-process"],
		outputFile: {
			json: `./.e2e-logs${isExperimental ? "-experimental" : ""}/${testPackageManager}/results.json`,
		},
	},
});
