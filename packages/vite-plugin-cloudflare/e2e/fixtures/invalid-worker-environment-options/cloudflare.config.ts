import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "worker",
	entrypoint: "./index.js",
	compatibilityDate: "2024-12-30",
});
