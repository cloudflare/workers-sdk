import * as entrypoint from "./index.ts" with { type: "cf-worker" };

export const nestedWorkerConfig = {
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
} as const;
