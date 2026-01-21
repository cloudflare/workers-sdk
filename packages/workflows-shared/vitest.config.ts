import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

// Use the well-known symbol for kCurrentWorker (defined in miniflare)
// so we can bind TestWorkflow as USER_WORKFLOW on the current worker.
const kCurrentWorker = Symbol.for("miniflare.kCurrentWorker");

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				isolatedStorage: true,
				main: "tests/test-entry.ts",
				miniflare: {
					compatibilityDate: "2025-02-04",
					compatibilityFlags: ["service_binding_extra_handlers"],
					durableObjects: {
						ENGINE: {
							className: "Engine",
							useSQLite: true,
						},
					},
					serviceBindings: {
						USER_WORKFLOW: {
							name: kCurrentWorker as unknown as string,
							entrypoint: "TestWorkflow",
						},
					},
				},
			},
		},
	},
});
