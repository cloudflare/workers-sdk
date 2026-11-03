import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			// Preview API failures can outlast the short per-request retry window.
			retry: { count: 1, delay: 5_000 },
		},
	})
);
