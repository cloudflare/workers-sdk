import { defineConfig } from "wrangler/config";

export default defineConfig({
	name: "worker-ts",
	entrypoint: "src/index.ts",
	compatibilityDate: "2023-05-04",
	triggers: [{ type: "workers.dev" }],
	env: {
		MY_TEXT: {
			type: "plain_text",
			value: "test2",
		},
		MY_OTHER: {
			type: "r2_bucket",
		},
	},
});
