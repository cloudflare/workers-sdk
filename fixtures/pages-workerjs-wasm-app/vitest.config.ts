import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 5_000,
		hookTimeout: 10_000,
		teardownTimeout: 5_000,
		useAtomics: true,
	},
});
