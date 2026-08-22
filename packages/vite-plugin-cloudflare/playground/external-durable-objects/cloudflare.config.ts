import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
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
		COUNTERS: {
			type: "durable-object",
			workerName: "worker-b",
			exportName: "Counter",
		},
	},
});
