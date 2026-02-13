import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					// Required to use `SELF.queue()`. This is an experimental
					// compatibility flag, and cannot be enabled in production.
					compatibilityFlags: [
						"service_binding_extra_handlers",
						"fetch_iterable_type_support",
						"fetch_iterable_type_support_override_adjustment",
						"enable_nodejs_process_v2",
					],
					// Use a shorter `max_batch_timeout` in tests
					queueConsumers: {
						queue: { maxBatchTimeout: 0.05 /* 50ms */ },
					},
				},
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			},
		},
	},
});
