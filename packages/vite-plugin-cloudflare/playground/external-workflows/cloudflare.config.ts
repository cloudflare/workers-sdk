import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./worker-a/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker-a",
		compatibilityDate: "2024-12-30",
		entrypoint,
		compatibilityFlags: ["enable_ctx_exports"],
		env: {
			MY_WORKFLOW: bindings.workflow({
				name: "workflow",
				worker: "worker-b",
				exportName: "MyWorkflow",
			}),
		},
	},
});
