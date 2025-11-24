import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 15_000,
		pool: "forks",
		retry: 0,
		include: ["**/tests/**/*.test.ts"],
		setupFiles: path.resolve(__dirname, "tests/vitest.setup.ts"),
		globalSetup: path.resolve(__dirname, "tests/vitest.global.ts"),
		reporters: ["default"],
		globals: true,
		snapshotFormat: {
			escapeString: true,
			printBasicPrototype: true,
		},
		unstubEnvs: true,
	},
});
