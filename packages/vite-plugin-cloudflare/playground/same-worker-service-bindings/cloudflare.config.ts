import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	exports: {
		NamedEntrypoint: { type: "worker" },
	},
	env: {
		NAMED_ENTRYPOINT: {
			type: "worker",
			worker: "worker",
			exportName: "NamedEntrypoint",
		},
		LEGACY: {
			type: "worker",
			worker: "worker",
			exportName: "legacy",
		},
	},
});
