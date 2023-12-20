import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 5_000,
		hookTimeout: 5_000,
		teardownTimeout: 5_000,
		useAtomics: true,
		include: ["src/__vitests__/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
	},
});
