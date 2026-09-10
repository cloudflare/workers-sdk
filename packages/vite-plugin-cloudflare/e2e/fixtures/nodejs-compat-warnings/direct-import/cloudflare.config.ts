import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "worker",
	entrypoint: "./src/index.ts",
	compatibilityDate: "2024-12-30",
});
