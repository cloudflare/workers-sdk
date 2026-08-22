import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./worker/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "api",
	entrypoint,
	compatibilityDate: "2024-12-30",
	assets: { notFoundHandling: "single-page-application" },
	exports: {
		MyServer: { type: "durable-object", storage: "sqlite" },
	},
	env: {
		Assets: { type: "assets" },
		MyServer: {
			type: "durable-object",
			worker: "api",
			exportName: "MyServer",
		},
	},
});
