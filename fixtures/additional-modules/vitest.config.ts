import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 15_000,
		hookTimeout: 15_000,
		teardownTimeout: 15_000,
		useAtomics: true,
	},
});
