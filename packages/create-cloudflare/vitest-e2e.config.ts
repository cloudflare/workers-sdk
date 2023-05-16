import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
	test: {
		include: ["e2e-tests/**/*.test.ts"],
		cache: false,
		root: ".",
		singleThread: true,
		threads: false,
		testTimeout: 1000 * 60 * 1, // 1 min for lengthy installs
		setupFiles: ["e2e-tests/setup.ts"],
	},
});
