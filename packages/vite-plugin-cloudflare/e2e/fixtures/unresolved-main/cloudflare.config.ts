import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "worker",
	entrypoint: "./nonexistent-bare-module",
	compatibilityDate: "2025-11-28",
});
