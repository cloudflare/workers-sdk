import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		define: {
			__VITE_PLUGIN_DEFAULT_COMPAT_DATE__: JSON.stringify("2024-01-01"),
		},
		test: {
			include: ["**/__tests__/**/*.spec.[tj]s"],
			exclude: ["**/node_modules/**", "**/dist/**", "./playground/**/*.*"],
		},
		publicDir: false,
	})
);
