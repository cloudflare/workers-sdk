import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as workerRandomEntrypoint from "./worker-random/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint: workerRandomEntrypoint,
	compatibilityDate: "2024-12-30",
});
