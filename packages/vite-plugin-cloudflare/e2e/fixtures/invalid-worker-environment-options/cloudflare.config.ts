import { defineConfig } from "@cloudflare/vite-plugin/experimental-config";

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint: "./index.js",
		compatibilityDate: "2024-12-30",
	},
});
