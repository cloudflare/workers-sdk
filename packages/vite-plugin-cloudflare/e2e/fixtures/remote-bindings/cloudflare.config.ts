import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import { auxiliaryWorkerConfig } from "./worker-configs.ts";

export const auxiliaryWorker = defineWorker(auxiliaryWorkerConfig);

export default defineWorker({
	name: "cloudflare-vite-e2e-remote-bindings-entry-worker",
	entrypoint: "./entry-worker/src/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		AI: { type: "ai", remote: true },
		LOCAL_WORKER: {
			type: "worker",
			workerName: "cloudflare-vite-e2e-remote-bindings-auxiliary-worker",
		},
		REMOTE_WORKER: {
			type: "worker",
			workerName: "<<REMOTE_WORKER_PLACEHOLDER>>",
			remote: true,
		},
	},
});
