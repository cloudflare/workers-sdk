import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "notes",
		entrypoint,
		compatibilityDate: "2026-05-18",
		triggers: [triggers.scheduled({ schedule: "0 * * * *" })],
		exports: {
			Counter: { type: "durable-object", storage: "sqlite" },
		},
		env: {
			GREETING: bindings.text("hello"),
			NOTES: bindings.kv(),
			DB: bindings.d1(),
			COUNTER: bindings.durableObject({
				worker: "notes",
				exportName: "Counter",
			}),
		},
	},
});
