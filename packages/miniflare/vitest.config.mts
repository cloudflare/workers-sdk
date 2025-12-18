import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 30_000,
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		retry: 0,
		include: ["test/**/*.spec.ts"],
		setupFiles: [path.resolve(__dirname, "test/setup.ts")],
		globals: true,
		env: {
			MINIFLARE_ASSERT_BODIES_CONSUMED: "true",
		},
	},
	resolve: {
		alias: {
			miniflare: path.resolve(__dirname, "dist/src/index.js"),
		},
	},
});
