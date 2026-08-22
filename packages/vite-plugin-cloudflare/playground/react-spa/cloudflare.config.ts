import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "react-spa",
	compatibilityDate: "2024-12-30",
	assets: { notFoundHandling: "single-page-application" },
});
