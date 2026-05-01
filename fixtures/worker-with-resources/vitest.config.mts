import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			reporters: ["default"],
			maxConcurrency: 1,
			fileParallelism: false,
		},
	})
);
