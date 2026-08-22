import { cloudflare } from "@cloudflare/vite-plugin";
import { triggers } from "@cloudflare/vite-plugin/experimental-config";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			config: {
				name: "worker-entrypoint",
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
						worker: "exported-handler",
					},
					WORKER_ENTRYPOINT_WITH_ASSETS: {
						type: "worker",
						worker: "worker-entrypoint-with-assets",
					},
					NAMED_ENTRYPOINT_WITH_ASSETS: {
						type: "worker",
						worker: "worker-entrypoint-with-assets",
						exportName: "NamedEntrypoint",
					},
				},
				tailConsumers: [{ worker: "exported-handler-with-assets" }],
				triggers: [
					triggers.queue({
						name: "test-queue",
						maxBatchSize: 1,
						maxBatchTimeout: 0,
					}),
				],
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
