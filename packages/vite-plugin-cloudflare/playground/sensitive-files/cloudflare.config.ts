import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import { compatibilityDate } from "./constants.ts";
import * as entrypoint from "./worker-a/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker-a",
		entrypoint,
		compatibilityDate,
		env: {
			WORKER_B: bindings.worker({ worker: "worker-b" }),
			DEV_VAR: bindings.secret(),
			ENV_VAR: bindings.secret(),
			STAGING_ENV_VAR: bindings.secret(),
		},
	},
});
