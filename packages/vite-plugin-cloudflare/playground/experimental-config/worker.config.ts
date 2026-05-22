import { defineConfig } from "@cloudflare/vite-plugin/experimental-config";

export default defineConfig({
	name: "experimental-config-worker",
	entrypoint: "./src/index.ts",
	compatibilityDate: "2024-12-30",
});
