import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as auxiliaryEntrypoint from "./src/auxiliary.ts" with { type: "cf-worker" };
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export const auxiliaryWorker = defineWorker({
	name: "auxiliary-worker",
	entrypoint: auxiliaryEntrypoint,
	compatibilityDate: "2024-12-30",
});

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
});
