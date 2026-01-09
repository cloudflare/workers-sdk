import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			// Use forks pool for process spawning tests
			pool: "forks",
		},
	})
);
