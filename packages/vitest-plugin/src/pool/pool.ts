import { Log, LogLevel } from "miniflare";
import { CloudflarePoolWorker } from "./cloudflare-pool-worker";
import { createSharedLogger } from "./logger";
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
	const logger = createSharedLogger(new Log(LogLevel.WARN, { prefix: "vpw" }));
	return {
		name: "cloudflare-pool",
		createPoolWorker: (options) =>
			new CloudflarePoolWorker(options, poolOptions, logger),
	};
}
