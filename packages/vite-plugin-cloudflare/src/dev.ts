import assert from "node:assert";
import { ROUTER_WORKER_NAME } from "./constants";
import type { ResolvedPluginConfig } from "./plugin-config";
import type { Miniflare } from "miniflare";

export type WorkerType = "workers-and-assets" | "assets-only" | "workers-only";

/**
 * Gets the entry-points that we might send requests to in Miniflare,
 * and also the type of the entry-point.
 */
export async function getDevEntryWorkers(
	resolvedPluginConfig: ResolvedPluginConfig,
	miniflare: Miniflare
) {
	const entryWorkerConfig =
		resolvedPluginConfig.type === "assets-only"
			? resolvedPluginConfig.config
			: resolvedPluginConfig.workers[
					resolvedPluginConfig.entryWorkerEnvironmentName
				];

	assert(entryWorkerConfig, "Unexpected error: No entry worker configuration");

	const userWorker =
		resolvedPluginConfig.type === "workers"
			? await miniflare.getWorker(entryWorkerConfig.name)
			: null;

	const entryWorker = entryWorkerConfig.assets
		? await miniflare.getWorker(ROUTER_WORKER_NAME)
		: await miniflare.getWorker(entryWorkerConfig.name);

	const workerType: WorkerType =
		resolvedPluginConfig.type === "assets-only"
			? "assets-only"
			: entryWorkerConfig.assets
				? "workers-and-assets"
				: "workers-only";

	return { entryWorker, userWorker, workerType };
}
