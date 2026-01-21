import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig } from "eslint/config";

export default defineConfig([
	...sharedConfig,
	{
		ignores: [
			"__tests__/fixtures/**",
			"__tests__/runtime/**",
			"scripts/**",
			"vitest.config.runtime.mts",
		],
	},
]);
