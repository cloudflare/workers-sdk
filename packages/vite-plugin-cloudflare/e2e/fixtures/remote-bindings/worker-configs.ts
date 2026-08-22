import type { WorkerConfigInput } from "@cloudflare/vite-plugin/experimental-config";

export const auxiliaryWorkerConfig = {
	name: "cloudflare-vite-e2e-remote-bindings-auxiliary-worker",
	entrypoint: "./auxiliary-worker/src/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		REMOTE_WORKER: {
			type: "worker",
			worker: "<<REMOTE_WORKER_PLACEHOLDER_ALT>>",
			dev: { remote: true },
		},
	},
} satisfies WorkerConfigInput;
