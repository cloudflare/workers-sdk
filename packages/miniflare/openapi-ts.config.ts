import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
	// Keep these paths in sync with the prettier inputs in package.json (generate:types script)
	input: "src/workers/local-explorer/openapi.local.json",
	output: "src/workers/local-explorer/generated",
	plugins: ["@hey-api/typescript", "zod"],
});
