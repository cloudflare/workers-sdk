import sharedConfig from "@cloudflare/eslint-config-shared/react";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: ["src/api/generated/**", "src/routeTree.gen.ts"],
	},
	sharedConfig,
]);
