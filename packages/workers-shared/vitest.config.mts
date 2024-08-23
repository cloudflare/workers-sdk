import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			include: ["asset-server-worker/tests/**.{test,spec}.{ts,js}"],
			globals: true,
		},
	})
);
