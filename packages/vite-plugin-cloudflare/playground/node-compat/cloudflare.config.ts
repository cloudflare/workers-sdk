import { defineConfig } from "cf/config";
import * as workerRandomEntrypoint from "./worker-random/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint: workerRandomEntrypoint,
		compatibilityDate: "2024-12-30",
	},
});
