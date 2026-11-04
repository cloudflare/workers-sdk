import { defineConfig } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "build-app-worker",
		entrypoint: "./worker.ts",
		compatibilityDate: "2024-12-30",
	},
});
