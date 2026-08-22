import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		ENV_NAME: bindings.secret(),
		MY_DEV_VAR_A: bindings.secret(),
		MY_DEV_VAR_B: bindings.secret(),
		MY_DEV_VAR_C: bindings.secret(),
	},
});
