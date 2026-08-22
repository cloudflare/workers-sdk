import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./worker-a/index.ts" with { type: "cf-worker" };
import * as auxiliaryEntrypoint from "./worker-b/index.ts" with { type: "cf-worker" };
import { auxiliaryWorkerConfig } from "./worker-configs.ts";

export const auxiliaryWorker = defineWorker({
	...auxiliaryWorkerConfig,
	entrypoint: auxiliaryEntrypoint,
});

export default defineWorker({
	name: "worker-a",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		WORKER_B: bindings.worker({ worker: "worker-b" }),
		DEV_VAR: bindings.secret(),
		ENV_VAR: bindings.secret(),
		STAGING_ENV_VAR: bindings.secret(),
	},
});
