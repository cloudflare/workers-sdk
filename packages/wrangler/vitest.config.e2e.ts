import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 24_0000,
		hookTimeout: 5_000,
		teardownTimeout: 5_000,
		useAtomics: true,
		include: ["e2e/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
	},
});
