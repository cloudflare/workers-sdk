import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "static-mpa",
	compatibilityDate: "2024-12-30",
	assets: {
		htmlHandling: "auto-trailing-slash",
		notFoundHandling: "404-page",
	},
});
