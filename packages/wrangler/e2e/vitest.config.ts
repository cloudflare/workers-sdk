import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 240_000,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		retry: 2,
		include: ["e2e/**/*.test.ts"],
		globalSetup: path.resolve(__dirname, "./validate-environment.ts"),
		reporters: ["verbose", "html"],
	},
});
