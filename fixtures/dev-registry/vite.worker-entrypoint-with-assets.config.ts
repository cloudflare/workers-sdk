import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	// Override the default public directory to use the assets directory
	// so that other vite projects won't share the same assets
	publicDir: "./assets",
	plugins: [
		cloudflare({
			config: {
				name: "worker-entrypoint-with-assets",
				entrypoint: "./workers/worker-entrypoint.ts",
				compatibilityDate: "2025-05-01",
				env: {
					SERVICE_WORKER: {
						type: "worker",
						worker: "service-worker",
					},
					EXPORTED_HANDLER: {
						type: "worker",
						worker: "exported-handler",
					},
					EXPORTED_HANDLER_WITH_ASSETS: {
						type: "worker",
						worker: "exported-handler-with-assets",
					},
					WORKER_ENTRYPOINT: {
						type: "worker",
						worker: "worker-entrypoint",
					},
					NAMED_ENTRYPOINT: {
						type: "worker",
						worker: "worker-entrypoint",
						exportName: "NamedEntrypoint",
					},
				},
			},
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: {
				internalDurableObject: {
					config: {
						name: "internal-durable-object",
						entrypoint: "./workers/durable-object.ts",
						compatibilityDate: "2025-05-01",
						env: {
							DURABLE_OBJECT: {
								type: "durable-object",
								worker: "internal-durable-object",
								exportName: "TestObject",
							},
						},
						exports: {
							TestObject: {
								type: "durable-object",
								storage: "sqlite",
							},
						},
					},
				},
			},
		}),
	],
});
