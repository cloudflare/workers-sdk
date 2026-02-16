import { defineConfig } from "wrangler/config";

export default defineConfig({
	name: "worker-ts",
	main: "src/index.ts",
	compatibility_date: "2023-05-04",
	vars: {
		MY_TEXT: "test2",
	},
	r2_buckets: [
		{
			binding: "MY_OTHER",
		},
	],
});
