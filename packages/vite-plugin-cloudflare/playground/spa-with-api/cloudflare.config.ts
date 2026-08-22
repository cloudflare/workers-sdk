import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./api/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2025-06-04",
	assets: { notFoundHandling: "single-page-application" },
	env: { ASSETS: { type: "assets" } },
});
