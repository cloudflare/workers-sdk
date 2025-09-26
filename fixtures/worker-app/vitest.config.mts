import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			pool: "threads",
			poolOptions: {
				threads: { singleThread: true },
			},
			maxConcurrency: 1,
		},
	})
);
