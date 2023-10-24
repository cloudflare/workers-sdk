import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["tsconfig.json"] })],
	test: {
		include: ["src/**/__tests__/**.test.ts"],
		setupFiles: ["vitest.setup.ts"],
	},
});
