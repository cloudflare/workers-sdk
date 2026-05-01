import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
		test: {
			include: ["src/**/__tests__/**.test.ts"],
			mockReset: true,
			reporters: ["default"],
			setupFiles: ["vitest.setup.ts"],
		},
	})
);
