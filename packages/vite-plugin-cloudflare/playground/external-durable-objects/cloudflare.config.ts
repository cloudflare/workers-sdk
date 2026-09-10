import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./worker-a/index.ts" with { type: "cf-worker" };
import * as auxiliaryEntrypoint from "./worker-b/index.ts" with { type: "cf-worker" };

export const auxiliaryWorker = defineWorker({
	name: "worker-b",
	entrypoint: auxiliaryEntrypoint,
	compatibilityDate: "2024-12-30",
	exports: { Counter: { type: "durable-object", storage: "sqlite" } },
});

export default defineWorker({
	name: "worker-a",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		COUNTERS: bindings.durableObject({
			worker: "worker-b",
			exportName: "Counter",
		}),
	},
});
