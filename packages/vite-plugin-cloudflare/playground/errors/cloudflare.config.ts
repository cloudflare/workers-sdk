import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/worker-a/index.ts" with { type: "cf-worker" };
import * as auxiliaryEntrypoint from "./src/worker-b/index.ts" with { type: "cf-worker" };
import { auxiliaryWorkerConfig } from "./worker-configs.ts";

export const auxiliaryWorker = defineWorker({
	...auxiliaryWorkerConfig,
	entrypoint: auxiliaryEntrypoint,
});

export default defineWorker({
	name: "worker-a",
	entrypoint,
	compatibilityDate: "2024-12-30",
	exports: { NamedEntrypoint: { type: "worker" } },
	env: {
		NAMED_ENTRYPOINT: {
			type: "worker",
			worker: "worker-a",
			exportName: "NamedEntrypoint",
		},
		AUXILIARY_WORKER: { type: "worker", worker: "worker-b" },
	},
});
