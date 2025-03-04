import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 25_000,
		hookTimeout: 25_000,
		teardownTimeout: 25_000,
		// useAtomics: true,
	},
});
