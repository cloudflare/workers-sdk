import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "durable-objects-exports",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			COUNTER: bindings.durableObject({
				worker: "durable-objects-exports",
				exportName: "Counter",
			}),
		},
		exports: {
			Counter: exports.durableObject({
				storage: "sqlite",
			}),
			UnboundCounter: exports.durableObject({
				storage: "sqlite",
			}),
		},
	},
});
