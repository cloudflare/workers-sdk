import { CloudflarePoolWorker } from "./cloudflare-pool-worker";
import type { WorkersPoolOptions } from "./config";
import type { WorkerPoolOptionsContext } from "./plugin";
import type { PoolRunnerInitializer } from "vitest/node";

export function cloudflarePool(
	poolOptions:
		| WorkersPoolOptions
		| ((
				ctx: WorkerPoolOptionsContext
		  ) => Promise<WorkersPoolOptions> | WorkersPoolOptions)
): PoolRunnerInitializer {
	return {
		name: "cloudflare-pool",
		createPoolWorker: (options) =>
			new CloudflarePoolWorker(options, poolOptions),
	};
}
