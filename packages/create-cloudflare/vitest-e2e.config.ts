import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
	test: {
		include: ["e2e-tests/**/*.test.ts"],
		cache: false,
		root: ".",
		testTimeout: 1000 * 60 * 3, // 3 min for lengthy installs
		maxConcurrency: 2,
		setupFiles: ["e2e-tests/setup.ts"],
	},
});
