import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "cloudflare-vite-e2e-basic",
	entrypoint: "./api/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
	assets: { notFoundHandling: "single-page-application" },
	env: {
		ASSETS: { type: "assets" },
		VAR_1: { type: "text", value: "var-1" },
	},
});
