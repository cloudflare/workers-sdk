import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/__tests__/**/*.{test,spec}.{ts,js,tsx,jsx}"],
		testTimeout: 30000,
		setupFiles: "./vite.setup.ts",
	},
});
