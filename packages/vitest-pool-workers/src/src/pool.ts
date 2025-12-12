import { PoolRunnerInitializer } from "vitest/node";
import { CloudflarePoolWorker } from "./cloudflare-pool-worker";
import { WorkersPoolOptions } from "./config";

export function cloudflarePool(
	poolOptions: WorkersPoolOptions
): PoolRunnerInitializer {
	return {
		name: "cloudflare-pool",
		createPoolWorker: (options) =>
			new CloudflarePoolWorker(options, poolOptions),
	};
}
