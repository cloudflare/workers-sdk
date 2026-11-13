import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			// Preview API failures can outlast the short per-request retry window,
			// sometimes for 40s or more, so space the retries out to ride that out.
			retry: { count: 2, delay: 15_000 },
		},
	})
);
