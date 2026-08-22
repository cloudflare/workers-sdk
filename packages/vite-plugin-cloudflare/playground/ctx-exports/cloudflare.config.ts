import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2025-11-06",
	compatibilityFlags: ["enable_ctx_exports"],
	exports: {
		MyDurableObject: { type: "durable-object", storage: "legacy-kv" },
	},
});
