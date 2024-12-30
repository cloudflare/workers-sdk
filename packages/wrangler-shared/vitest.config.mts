import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			include: ["**/__tests__/**/*.{test,spec}.{ts,js,tsx,jsx}"],
			setupFiles: "./vite.setup.ts",
		},
	})
);
