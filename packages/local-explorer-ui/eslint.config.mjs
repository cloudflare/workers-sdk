import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharedConfig from "@cloudflare/eslint-config-shared/react";
import tailwind from "eslint-plugin-tailwindcss";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: ["src/api/generated/**", "src/routeTree.gen.ts"],
	},
	sharedConfig,
	...tailwind.configs["flat/recommended"],
	{
		settings: {
			tailwindcss: {
				callees: ["cn"],
				config:
					dirname(fileURLToPath(import.meta.url)) + "/src/styles/tailwind.css",
			},
		},
	},
]);
