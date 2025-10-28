import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 15_000,
		pool: "forks",
		retry: 0,
		include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
		setupFiles: path.resolve(__dirname, "src/__tests__/vitest.setup.ts"),
		globalSetup: path.resolve(__dirname, "src/__tests__/vitest.global.ts"),
		reporters: ["default"],
		globals: true,
		snapshotFormat: {
			escapeString: true,
			printBasicPrototype: true,
		},
		unstubEnvs: true,
	},
});
