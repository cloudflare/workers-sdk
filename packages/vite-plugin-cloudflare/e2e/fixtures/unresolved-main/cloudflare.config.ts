import { defineConfig } from "@cloudflare/vite-plugin/experimental-config";

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint: "nonexistent-bare-module",
		compatibilityDate: "2025-11-28",
	},
});
