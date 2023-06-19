import { defineConfig } from "vitest/config";

// This default gets pulled in by all the Vitest runs in the monorepo.
export default defineConfig({
	test: {
		testTimeout: 30_000,
		hookTimeout: 30_000,
		restoreMocks: true,
		globals: true,
	},
});
