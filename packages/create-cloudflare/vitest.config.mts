import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		resolve: {
			tsconfigPaths: true,
		},
		test: {
			include: ["src/**/__tests__/**.test.ts"],
			mockReset: true,
			setupFiles: ["vitest.setup.ts"],
		},
	})
);
