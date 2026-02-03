import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
	// Keep these paths in sync with the prettier inputs in package.json (generate:types script)
	input: "src/workers/local-explorer/openapi.local.json",
	output: "src/workers/local-explorer/generated",
	plugins: ["@hey-api/typescript", "zod"],
	parser: {
		patch: {
			schemas: {
				// The base API response schemas define `result` as a generic object,
				// but child schemas override it with specific types (e.g., arrays).
				// OpenAPI's `allOf` is meant to merge schemas, but @hey-api/openapi-ts
				// generates Zod's `.and()` (intersection), which doesn't allow property
				// overrides. Removing `result` from base schemas allows child schemas
				// to define their own `result` type without conflicts.
				"d1_api-response-common": (schema) => {
					if (schema.properties) {
						delete schema.properties.result;
					}

					if (schema.required) {
						schema.required = schema.required.filter(
							(r: string) => r !== "result"
						);
					}
				},
			},
		},
	},
});
