import assert from "node:assert";
import { debuglog } from "./utils";
import type { CloudflareDevEnvironment } from "./cloudflare-environment";
import type { WorkersResolvedConfig } from "./plugin-config";
import type { Miniflare } from "miniflare";
import type * as vite from "vite";

export type ExportTypes = Record<
	string,
	"DurableObject" | "WorkerEntrypoint" | "WorkflowEntrypoint"
>;

/**
 * Fetches the export types for all Workers and returns them in a Map
 */
export async function getCurrentWorkerNameToExportTypesMap(
	resolvedPluginConfig: WorkersResolvedConfig,
	viteDevServer: vite.ViteDevServer,
	miniflare: Miniflare
): Promise<Map<string, ExportTypes>> {
	const results = await Promise.all(
		[...resolvedPluginConfig.environmentNameToWorkerMap].map(
			async ([environmentName, worker]) => {
				debuglog(`Fetching export types for worker "${worker.config.name}"`);
				const exportTypes = await (
					viteDevServer.environments[
						environmentName
					] as CloudflareDevEnvironment
				).fetchWorkerExportTypes(miniflare, worker.config);

				return [worker.config.name, exportTypes] as const;
			}
		)
	);

	return new Map(results);
}

/**
 * Compares the export types for all Workers and returns `true` if any have changed
 */
export function compareWorkerNameToExportTypesMaps(
	oldWorkerNameToExportTypesMap: Map<string, ExportTypes>,
	newWorkerNameToExportTypesMap: Map<string, ExportTypes>
): boolean {
	for (const workerName of newWorkerNameToExportTypesMap.keys()) {
		const oldExportTypes = oldWorkerNameToExportTypesMap.get(workerName);
		assert(oldExportTypes, "Expected old export types to be defined");
		const newExportTypes = newWorkerNameToExportTypesMap.get(workerName);
		assert(newExportTypes, "Expected new export types to be defined");
		const hasChanged = compareExportTypes(oldExportTypes, newExportTypes);

		if (hasChanged) {
			return true;
		}
	}

	return false;
}

/**
 * Compares two `ExportTypes` objects and returns true if they do not match.
 * Checks for added/removed exports and changed export types.
 */
export function compareExportTypes(
	oldExportTypes: ExportTypes,
	newExportTypes: ExportTypes
): boolean {
	const oldKeys = Object.keys(oldExportTypes);
	const newKeys = Object.keys(newExportTypes);

	// Check if number of exports has changed
	if (oldKeys.length !== newKeys.length) {
		return true;
	}

	// Check if any keys were added or removed, or if any values changed
	for (const key of newKeys) {
		if (
			!(key in oldExportTypes) ||
			oldExportTypes[key] !== newExportTypes[key]
		) {
			return true;
		}
	}

	return false;
}
