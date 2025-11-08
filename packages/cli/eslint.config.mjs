import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig } from "eslint/config";

export default defineConfig({
	extends: [sharedConfig],
	rules: {
		"no-console": "error",
	},
});
