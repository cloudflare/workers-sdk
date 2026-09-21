import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./worker-a/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
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
	},
});
