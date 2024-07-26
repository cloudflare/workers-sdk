import tsconfigPaths from "vite-tsconfig-paths";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
		test: {
			include: ["src/**/__tests__/**.test.ts"],
			setupFiles: ["vitest.setup.ts"],
		},
	}),
);
