import { defineProject, mergeConfig } from "vitest/config";

import configShared from "../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			include: ["**/__tests__/*.test.ts"],
			retry: 0,
		},
	})
);
