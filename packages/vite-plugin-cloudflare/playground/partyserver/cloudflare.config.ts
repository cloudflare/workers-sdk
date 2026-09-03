import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
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
		Assets: bindings.assets(),
		MyServer: bindings.durableObject({
			worker: "api",
			exportName: "MyServer",
		}),
	},
});
