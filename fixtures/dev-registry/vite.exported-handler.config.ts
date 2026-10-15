import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			config: {
				name: "exported-handler",
				entrypoint: "./workers/exported-handler.ts",
				compatibilityDate: "2025-05-01",
				env: {
					SERVICE_WORKER: {
						type: "worker",
						worker: "service-worker",
					},
					WORKER_ENTRYPOINT: {
						type: "worker",
						worker: "worker-entrypoint",
					},
					WORKER_ENTRYPOINT_WITH_ASSETS: {
						type: "worker",
						worker: "worker-entrypoint-with-assets",
					},
					NAMED_ENTRYPOINT: {
						type: "worker",
						worker: "worker-entrypoint",
						exportName: "NamedEntrypoint",
					},
					NAMED_ENTRYPOINT_WITH_ASSETS: {
						type: "worker",
						worker: "worker-entrypoint-with-assets",
						exportName: "NamedEntrypoint",
					},
					QUEUE: { type: "queue", name: "test-queue" },
				},
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
