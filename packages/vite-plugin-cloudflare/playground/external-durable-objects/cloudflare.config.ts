import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./worker-a/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker-a",
		entrypoint,
		compatibilityDate: "2024-12-30",
		env: {
			COUNTERS: bindings.durableObject({
				worker: "worker-b",
				exportName: "Counter",
			}),
		},
	},
});
