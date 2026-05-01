import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			include: ["**/__tests__/**/*.{test,spec}.{ts,js,tsx,jsx}"],
			reporters: ["default"],
			setupFiles: "./vite.setup.ts",
		},
	})
);
