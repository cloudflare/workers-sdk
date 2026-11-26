import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2025-11-06",
		compatibilityFlags: ["enable_ctx_exports"],
		exports: {
			MyDurableObject: { type: "durable-object", storage: "legacy-kv" },
		},
	},
});
