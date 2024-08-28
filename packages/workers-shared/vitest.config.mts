import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			include: ["asset-worker/tests/**.{test,spec}.{ts,js}"],
			globals: true,
		},
	})
);
