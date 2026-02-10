import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 30_000,
		hookTimeout: 30_000,
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		include: ["test/**/*.spec.ts"],
		setupFiles: [path.resolve(__dirname, "test/setup.mjs")],
		globals: true,
		env: {
			MINIFLARE_ASSERT_BODIES_CONSUMED: "true",
		},
	},
	resolve: {
		alias: {
			miniflare: path.resolve(__dirname, "dist/src/index.js"),
			"miniflare:shared": path.resolve(
				__dirname,
				"src/workers/shared/index.ts"
			),
			"miniflare:zod": path.resolve(
				__dirname,
				"src/workers/shared/zod.worker.ts"
			),
		},
	},
});
