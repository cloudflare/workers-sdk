import {
	defineConfig,
	exports as workerExports,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		compatibilityDate: "2024-12-30",
		entrypoint,
		compatibilityFlags: ["enable_ctx_exports"],
		exports: {
			MyWorkflow: workerExports.workflow({ name: "workflow" }),
		},
	},
});
