import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
	input: "../miniflare/src/workers/local-explorer/openapi.local.json",
	output: "src/api/generated",
	plugins: [
		"@hey-api/typescript",
		{
			name: "@hey-api/client-fetch",
			runtimeConfigPath: "../client-config",
		},
		"@hey-api/sdk",
	],
});
