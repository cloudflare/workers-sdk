import { defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "workflows-exports",
		compatibilityDate: "2026-10-19",
		entrypoint,
		exports: {
			GreetingWorkflow: exports.workflow({ name: "greeting-workflow" }),
		},
	},
});
