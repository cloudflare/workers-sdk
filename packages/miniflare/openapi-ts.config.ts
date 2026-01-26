// Used to generate typescript for Local Explorer's OpenAPI spec
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
	input: "src/workers/local-explorer/openapi.local.json",
	output: "src/workers/local-explorer/generated",
	plugins: ["@hey-api/typescript", "zod"],
});
