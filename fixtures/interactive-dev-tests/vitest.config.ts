import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			// `node-pty` doesn't work inside worker threads
			pool: "forks",
		},
	})
);
