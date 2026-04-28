import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			// The three test files in this fixture each spawn their own
			// `wrangler dev` against the same working directory, so they share
			// the `.wrangler/state` SQLite cache. Running them in parallel hits
			// `SQLITE_BUSY` intermittently and causes workerd to abort with
			// "The Workers runtime failed to start", leaving tests to fail with
			// ECONNREFUSED. Run the files serially to avoid the contention.
			fileParallelism: false,
		},
	})
);
