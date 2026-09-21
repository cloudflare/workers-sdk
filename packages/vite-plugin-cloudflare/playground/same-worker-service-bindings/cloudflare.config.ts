import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2024-12-30",
		exports: {
			NamedEntrypoint: { type: "worker" },
		},
		env: {
			NAMED_ENTRYPOINT: bindings.worker({
				worker: "worker",
				exportName: "NamedEntrypoint",
			}),
			LEGACY: bindings.worker({
				worker: "worker",
				exportName: "legacy",
			}),
		},
	},
});
