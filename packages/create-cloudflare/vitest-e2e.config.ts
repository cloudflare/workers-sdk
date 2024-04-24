import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

process.env.E2E = "true";

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
	test: {
		include: ["e2e-tests/**/*.test.ts"],
		cache: false,
		root: ".",
		testTimeout: 1000 * 60 * 10, // 10 min for lengthy installs
		maxConcurrency: 3,
		setupFiles: ["e2e-tests/setup.ts", "dotenv/config"],
		reporters: ["json", "verbose", "hanging-process"],
		outputFile: {
			json: "./.e2e-logs/" + process.env.TEST_PM + "/results.json",
		},
	},
});
