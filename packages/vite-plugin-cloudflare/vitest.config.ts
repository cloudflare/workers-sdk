import { defineConfig } from "vitest/config";

export default defineConfig({
	define: {
		__VITE_PLUGIN_DEFAULT_COMPAT_DATE__: JSON.stringify("2024-01-01"),
	},
	test: {
		include: ["**/__tests__/**/*.spec.[tj]s"],
		exclude: ["**/node_modules/**", "**/dist/**", "./playground/**/*.*"],
		testTimeout: 50_000,
	},
	publicDir: false,
});
