import { defineConfig } from "@cloudflare/vite-plugin/experimental-config";

export default defineConfig({
	worker: {
		name: "static",
		compatibilityDate: "2024-12-30",
		assets: {},
	},
});
