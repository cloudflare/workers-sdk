import type { WorkerConfigInput } from "@cloudflare/vite-plugin/experimental-config";

export const auxiliaryWorkerConfig = {
	name: "worker-b",
	entrypoint: "./worker-b/index.ts",
	compatibilityDate: "2024-12-30",
	exports: { Counter: { type: "durable-object", storage: "sqlite" } },
} satisfies WorkerConfigInput;
