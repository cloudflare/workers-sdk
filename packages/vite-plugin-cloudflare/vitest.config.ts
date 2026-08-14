import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			include: ["**/__tests__/**/*.spec.[tj]s"],
			exclude: ["**/node_modules/**", "**/dist/**", "./playground/**/*.*"],
		},
		publicDir: false,
	})
);
