import { defineConfig } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "runtime-failure-worker",
		entrypoint: "./index.ts",
		compatibilityDate: "2024-12-30",
	},
});
