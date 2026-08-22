import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		TEST_IF_VITE_CRASH_WITH_UNKNOWN_NAMED_ENTRYPOINT: {
			type: "worker",
			worker: "unknown-worker",
			exportName: "NamedEntrypoint",
		},
	},
});
