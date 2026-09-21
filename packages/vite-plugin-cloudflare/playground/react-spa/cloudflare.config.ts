import { defineConfig } from "@cloudflare/vite-plugin/experimental-config";

export default defineConfig({
	worker: {
		name: "react-spa",
		compatibilityDate: "2024-12-30",
		assets: { notFoundHandling: "single-page-application" },
	},
});
