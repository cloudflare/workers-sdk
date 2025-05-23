import { defineConfig } from "vitest/config";

// import config from "../../vitest.shared";

export default defineConfig({
	test: {
		testTimeout: 100_000,
	},
});
