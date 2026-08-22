import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	exports: {
		Counter: { type: "durable-object", storage: "sqlite" },
		Legacy: { type: "durable-object", storage: "legacy-kv" },
	},
	env: {
		COUNTERS: bindings.durableObject({
			worker: "worker",
			exportName: "Counter",
		}),
		LEGACY: bindings.durableObject({
			worker: "worker",
			exportName: "Legacy",
		}),
	},
});
