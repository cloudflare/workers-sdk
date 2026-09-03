import { defineWorker } from "@cloudflare/config";

export default defineWorker({
	name: "my-worker",
	entrypoint: "./index.ts",
	compatibilityDate: "2024-12-30",
});
