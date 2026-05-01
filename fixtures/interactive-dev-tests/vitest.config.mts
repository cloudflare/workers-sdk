import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			// `node-pty` doesn't work inside worker threads
			reporters: ["default"],
			pool: "forks",
		},
	})
);
