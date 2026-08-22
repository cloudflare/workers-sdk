import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "static",
	compatibilityDate: "2024-12-30",
	assets: {},
});
