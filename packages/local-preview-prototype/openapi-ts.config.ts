import { defineConfig } from "@hey-api/openapi-ts";

// Same input and plugins as `packages/local-explorer-ui/openapi-ts.config.ts`.
// The only difference is that there is no runtime config module: Node callers
// create a client per runtime with an absolute `baseUrl`.
export default defineConfig({
	input: "../miniflare/src/workers/local-explorer/openapi.local.json",
	output: "src/generated",
	plugins: ["@hey-api/typescript", "@hey-api/client-fetch", "@hey-api/sdk"],
});
