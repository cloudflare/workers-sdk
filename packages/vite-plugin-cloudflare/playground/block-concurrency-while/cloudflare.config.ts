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
			MyDurableObject: { type: "durable-object", storage: "sqlite" },
		},
		env: {
			MyDurableObject: bindings.durableObject({
				worker: "worker",
				exportName: "MyDurableObject",
			}),
		},
	},
});
