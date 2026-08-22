import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-09-09",
	exports: {
		WebSocketServer: { type: "durable-object", storage: "sqlite" },
	},
	env: {
		WEBSOCKET_SERVER: {
			type: "durable-object",
			worker: "worker",
			exportName: "WebSocketServer",
		},
	},
});
