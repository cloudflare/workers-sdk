import { defineConfig, createBindings, bindings } from "@cloudflare/config";
import * as entrypoint from "./src" with { type: "cf-worker" };
import type WorkerAConfig from "@config-examples/worker-a/config";

const b = createBindings<typeof WorkerAConfig>();

export default defineConfig({
	name: "worker-b",
	entrypoint,
	env: {
		// Type-safe bindings to worker-a (workerName and exportName are constrained)
		WORKER_A: b.worker({
			workerName: "worker-a",
		}),
		WORKER_A_ENTRYPOINT: b.worker({
			workerName: "worker-a",
			exportName: "MyEntrypoint",
		}),
		MY_DO: b.durableObject({
			workerName: "worker-a",
			exportName: "MyDurableObject",
		}),
		MY_WORKFLOW: b.workflow({
			workerName: "worker-a",
			exportName: "MyWorkflow",
		}),
		// Untyped binding for external services not in our codebase
		EXTERNAL_SERVICE: bindings.worker({
			workerName: "external-service",
			exportName: "something",
		}),
		// Non-cross-worker bindings work with either
		MY_KV: b.kv(),
		MY_DB: b.d1(),
	},
});
