import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	// Override the default public directory to use the assets directory
	// so that other non assets vite projects won't share the same assets
	publicDir: "./assets",
	plugins: [
		cloudflare({
			config: {
				name: "exported-handler-with-assets",
				entrypoint: "./workers/exported-handler.ts",
				compatibilityDate: "2025-05-01",
				env: {
					SERVICE_WORKER: {
						type: "worker",
						worker: "service-worker",
					},
					EXPORTED_HANDLER: {
						type: "worker",
						worker: "exported-worker",
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
				},
				tailConsumers: [{ worker: "exported-handler" }],
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
