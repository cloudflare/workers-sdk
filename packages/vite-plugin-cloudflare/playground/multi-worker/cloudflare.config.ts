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
});

export default defineWorker({
	name: "worker-a",
	entrypoint,
	compatibilityDate: "2024-12-30",
	tailConsumers: [{ worker: "tail-a" }],
	env: {
		WORKER_B: bindings.worker({ worker: "worker-b" }),
		NAMED_ENTRYPOINT: bindings.worker({
			worker: "worker-b",
			exportName: "NamedEntrypoint",
		}),
	},
});
