import type { WorkerConfigInput } from "@cloudflare/vite-plugin/experimental-config";

export const auxiliaryWorkerConfig = {
	name: "worker-b",
	entrypoint: "./src/worker-b/index.ts",
	compatibilityDate: "2024-12-30",
	exports: { NamedEntrypoint: { type: "worker" } },
	env: {
		NAMED_ENTRYPOINT: {
			type: "worker",
			worker: "worker-b",
			exportName: "NamedEntrypoint",
		},
	},
} satisfies WorkerConfigInput;
