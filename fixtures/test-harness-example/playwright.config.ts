import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "playwright.test.ts",
	use: {
		browserName: "chromium",
	},
});
