import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "durable-objects",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			COUNTER: bindings.durableObject({
				worker: "durable-objects",
				exportName: "Counter",
			}),
			SQL: bindings.durableObject({
				worker: "durable-objects",
				exportName: "SQLiteDurableObject",
			}),
		},
		exports: {
			Counter: exports.durableObject({ storage: "legacy-kv" }),
			SQLiteDurableObject: exports.durableObject({ storage: "sqlite" }),
		},
	},
});
