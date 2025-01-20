import assert from "node:assert";
import { ROUTER_WORKER_NAME } from "./constants";
import type { ResolvedPluginConfig } from "./plugin-config";
import type { Miniflare } from "miniflare";

export function getDevEntryWorker(
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

	return entryWorkerConfig.assets
		? miniflare.getWorker(ROUTER_WORKER_NAME)
		: miniflare.getWorker(entryWorkerConfig.name);
}
