import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/worker-a/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker-a",
		entrypoint,
		compatibilityDate: "2024-12-30",
		env: {
			NAMED_ENTRYPOINT: bindings.worker({
				worker: "worker-a",
				exportName: "NamedEntrypoint",
			}),
			AUXILIARY_WORKER: bindings.worker({ worker: "worker-b" }),
		},
	},
});
