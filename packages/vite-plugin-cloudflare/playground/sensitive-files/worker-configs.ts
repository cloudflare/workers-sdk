import type { WorkerConfigInput } from "@cloudflare/vite-plugin/experimental-config";

export const auxiliaryWorkerConfig = {
	name: "worker-b",
	entrypoint: "./worker-b/index.ts",
	compatibilityDate: "2024-12-30",
	env: {
		DEV_VAR: { type: "secret" },
		WORKER_B_ENV: { type: "secret" },
	},
} satisfies WorkerConfigInput;
