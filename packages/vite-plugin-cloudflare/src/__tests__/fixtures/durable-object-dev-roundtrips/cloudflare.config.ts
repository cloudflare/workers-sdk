import { bindings, defineConfig } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "my-worker",
		entrypoint: "./index.ts",
		compatibilityDate: "2024-12-30",
		exports: {
			Counter: { type: "durable-object", storage: "sqlite" },
		},
		env: {
			COUNTERS: bindings.durableObject({
				worker: "my-worker",
				exportName: "Counter",
			}),
		},
	},
});
