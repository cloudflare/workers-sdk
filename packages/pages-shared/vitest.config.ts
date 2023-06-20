import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.config";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			name: "pages-shared-tests",
			globals: true,
			restoreMocks: true,
			setupFiles: "./vitest.setup.ts",
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"./__tests__/override-request.ts",
			],
		},
	})
);
