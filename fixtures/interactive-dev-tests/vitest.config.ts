import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 30_000,
		hookTimeout: 30_000,
		teardownTimeout: 30_000,
		useAtomics: true,
		// `node-pty` doesn't work inside worker threads
		threads: false,
	},
});
