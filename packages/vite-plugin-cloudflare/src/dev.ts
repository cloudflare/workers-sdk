import assert from "node:assert";
import { ROUTER_WORKER_NAME } from "./constants";
import type { ResolvedPluginConfig } from "./plugin-config";
import type { Miniflare } from "miniflare";

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

	return { entryWorker, userWorker };
}
