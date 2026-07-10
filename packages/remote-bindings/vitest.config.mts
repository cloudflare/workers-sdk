import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "forks",
		include: ["src/**/*.test.ts"],
		mockReset: true,
		unstubEnvs: true,
	},
});
