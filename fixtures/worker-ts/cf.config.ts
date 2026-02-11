import { worker } from "wrangler/config";

export default worker(() => ({
	name: "worker-ts",
	entrypoint: "src/index.ts",
	compatibilityDate: "2023-05-04",
	env: {
		MY_TEXT: {
			type: "plain_text",
			value: "test",
		},
		MY_R2: {
			type: "r2_bucket",
		},
	},
}));
