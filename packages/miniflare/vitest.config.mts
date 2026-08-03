import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		reporters: ["default"],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		pool: "forks",
		maxWorkers: 1,
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
			// Exposes the worker-side raw-TCP relay helper to focused unit tests
			// without importing it by a real path (which would drag worker-typed
			// source into the node-side tsconfig, whose `exclude` covers
			// `src/workers/**`). The spec imports this id with an `@ts-expect-error`
			// since tsc has no matching path mapping.
			"@relay-under-test": path.resolve(
				__dirname,
				"src/workers/shared/remote-bindings-utils.ts"
			),
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
