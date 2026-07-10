import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "auxiliary-worker",
	entrypoint,
	compatibilityDate: "2026-05-18",
});
