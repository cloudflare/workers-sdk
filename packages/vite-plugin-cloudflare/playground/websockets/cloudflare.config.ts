import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2024-09-09",
		exports: {
			WebSocketServer: { type: "durable-object", storage: "sqlite" },
		},
		env: {
			WEBSOCKET_SERVER: bindings.durableObject({
				worker: "worker",
				exportName: "WebSocketServer",
			}),
		},
	},
});
