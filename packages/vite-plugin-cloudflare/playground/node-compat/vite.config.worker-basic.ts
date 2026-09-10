import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-basic",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./worker-basic/index.ts",
				compatibilityDate: "2024-12-30",
				compatibilityFlags: ["nodejs_compat"],
				exports: {
					MyDurableObject: { type: "durable-object", storage: "sqlite" },
					MyWorkerEntrypoint: { type: "worker" },
				},
				env: {
					MY_DO: {
						type: "durable-object",
						worker: "worker",
						exportName: "MyDurableObject",
					},
					MY_SERVICE: {
						type: "worker",
						worker: "worker",
						exportName: "MyWorkerEntrypoint",
					},
				},
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
