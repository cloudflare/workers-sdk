import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		ENV_NAME: { type: "secret" },
		MY_DEV_VAR_A: { type: "secret" },
		MY_DEV_VAR_B: { type: "secret" },
		MY_DEV_VAR_C: { type: "secret" },
	},
});
