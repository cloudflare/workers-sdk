import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "main-worker",
		compatibilityDate: "2025-11-01",
		compatibilityFlags: ["enable_ctx_exports"],
		entrypoint,
		env: {
			NAME: bindings.text("MainWorker"),
			AUXILIARY_WORKER: bindings.worker({ worker: "auxiliary-worker" }),
		},
		exports: {
			Counter: exports.durableObject({ storage: "sqlite" }),
			ConfiguredVirtualDurableObject: exports.durableObject({
				storage: "sqlite",
			}),
		},
	},
});
