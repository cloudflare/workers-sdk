import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores([
		"dist",
		"templates",
		"tsdown.config.ts",
		"vitest.config.ts",
		"test",
	]),
	sharedConfig,
]);
