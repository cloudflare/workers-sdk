import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			name: "pages-shared-tests",
			globals: true,
			restoreMocks: true,
			setupFiles: "./__tests__/vitest.setup.ts",
			exclude: ["**/node_modules/**", "**/dist/**"],
		},
	})
);
