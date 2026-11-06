import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "workflows",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			MODERATOR: bindings.workflow({
				name: "moderator-workflow",
				worker: "workflows",
				exportName: "ModeratorWorkflow",
			}),
		},
		exports: {
			ModeratorWorkflow: exports.workflow({
				name: "moderator-workflow",
			}),
		},
	},
});
