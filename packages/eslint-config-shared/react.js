import base from "./index.js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

// Use this ESLint config as @cloudflare/eslint-config-shared for Node projects
export default defineConfig([
	base,
	reactHooks.configs.flat.recommended,
	react.configs.flat.recommended,
	react.configs.flat["jsx-runtime"],
	{
		settings: {
			react: {
				version: "detect",
			},
		},
		files: ["**/*.ts", "**/*.tsx"],
		rules: {
			// This doesn't apply to the versions of React we depend on
			"react-hooks/preserve-manual-memoization": "off",
		},
	},
]);
