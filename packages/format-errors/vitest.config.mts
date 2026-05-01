import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			include: ["src/__tests__/**/*.{test,spec}.{ts,js}"],
			reporters: ["default"],
		},
	})
);
