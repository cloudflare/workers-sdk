import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig } from "eslint/config";

export default defineConfig(sharedConfig, {
	rules: {
		// Internal CI tooling — not production code, no need for the removeDir helper
		"workers-sdk/no-direct-recursive-rm": "off",
	},
});
