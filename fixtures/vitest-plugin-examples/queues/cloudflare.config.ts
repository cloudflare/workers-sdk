import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "queues",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			QUEUE_RESULTS: bindings.kv({
				id: "00000000000000000000000000000000",
			}),
			QUEUE_PRODUCER: bindings.queue({ name: "queue" }),
		},
		triggers: [
			triggers.queue({
				name: "queue",
				maxBatchTimeout: 3, // Overridden in `vitest.config.ts`
			}),
		],
	},
});
