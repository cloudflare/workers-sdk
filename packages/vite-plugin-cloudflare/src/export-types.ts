import assert from "node:assert";
import * as wrangler from "wrangler";
import { debuglog } from "./utils";
import type { CloudflareDevEnvironment } from "./cloudflare-environment";
import type { Worker, WorkersResolvedConfig } from "./plugin-config";
import type { Miniflare } from "miniflare";
import type * as vite from "vite";

export type ExportTypes = Record<
	string,
	"DurableObject" | "WorkerEntrypoint" | "WorkflowEntrypoint"
>;

function getWorkerNameToWorkerEntrypointExportsMap(
	workers: Worker[]
): Map<string, Set<string>> {
	const workerNameToWorkerEntrypointExportsMap = new Map(
		workers.map((worker) => [worker.config.name, new Set<string>()])
	);

	for (const worker of workers) {
		for (const value of worker.config.services ?? []) {
			if (value.entrypoint !== undefined && value.entrypoint !== "default") {
				const exportNames = workerNameToWorkerEntrypointExportsMap.get(
					value.service
				);

				exportNames?.add(value.entrypoint);
			}
		}
	}

	return workerNameToWorkerEntrypointExportsMap;
}

function getWorkerNameToDurableObjectExportsMap(
	workers: Worker[]
): Map<string, Set<string>> {
	const workerNameToDurableObjectExportsMap = new Map(
		workers.map((worker) => [
			worker.config.name,
			new Set(
				wrangler
					.unstable_getDurableObjectClassNameToUseSQLiteMap(
						worker.config.migrations
					)
					.keys()
			),
		])
	);

	for (const worker of workers) {
		for (const value of worker.config.durable_objects.bindings) {
			if (value.script_name) {
				const exportNames = workerNameToDurableObjectExportsMap.get(
					value.script_name
				);

				exportNames?.add(value.class_name);
			} else {
				const exportNames = workerNameToDurableObjectExportsMap.get(
					worker.config.name
				);

				exportNames?.add(value.class_name);
			}
		}
	}

	return workerNameToDurableObjectExportsMap;
}

function getWorkerNameToWorkflowEntrypointExportsMap(
	workers: Worker[]
): Map<string, Set<string>> {
	const workerNameToWorkflowEntrypointExportsMap = new Map(
		workers.map((worker) => [worker.config.name, new Set<string>()])
	);

	for (const worker of workers) {
		for (const value of worker.config.workflows) {
			if (value.script_name) {
				const exportNames = workerNameToWorkflowEntrypointExportsMap.get(
					value.script_name
				);

				exportNames?.add(value.class_name);
			} else {
				const exportNames = workerNameToWorkflowEntrypointExportsMap.get(
					worker.config.name
				);

				exportNames?.add(value.class_name);
			}
		}
	}

	return workerNameToWorkflowEntrypointExportsMap;
}

/**
 * Derives initial export types for all Workers from the Worker config files and returns them in a Map
 */
export function getInitialWorkerNameToExportTypesMap(
	resolvedPluginConfig: WorkersResolvedConfig
): Map<string, ExportTypes> {
	const workers = [...resolvedPluginConfig.environmentNameToWorkerMap.values()];
	const workerNameToWorkerEntrypointExportsMap =
		getWorkerNameToWorkerEntrypointExportsMap(workers);
	const workerNameToDurableObjectExportsMap =
		getWorkerNameToDurableObjectExportsMap(workers);
	const workerNameToWorkflowEntrypointExportsMap =
		getWorkerNameToWorkflowEntrypointExportsMap(workers);

	return new Map(
		workers.map((worker) => {
			const workerEntrypointExports =
				workerNameToWorkerEntrypointExportsMap.get(worker.config.name);
			assert(
				workerEntrypointExports,
				`WorkerEntrypoint exports not found for Worker "${worker.config.name}"`
			);
			const durableObjectExports = workerNameToDurableObjectExportsMap.get(
				worker.config.name
			);
			assert(
				durableObjectExports,
				`DurableObject exports not found for Worker "${worker.config.name}"`
			);
			const workflowEntrypointExports =
				workerNameToWorkflowEntrypointExportsMap.get(worker.config.name);
			assert(
				workflowEntrypointExports,
				`WorkflowEntrypoint exports not found for Worker "${worker.config.name}"`
			);

			const exportTypes: ExportTypes = {};

			for (const exportName of workerEntrypointExports) {
				exportTypes[exportName] = "WorkerEntrypoint";
			}

			for (const exportName of durableObjectExports) {
				exportTypes[exportName] = "DurableObject";
			}

			for (const exportName of workflowEntrypointExports) {
				exportTypes[exportName] = "WorkflowEntrypoint";
			}

			return [worker.config.name, exportTypes];
		})
	);
}

/**
 * Fetches the export types for all Workers and returns them in a Map
 */
export async function getCurrentWorkerNameToExportTypesMap(
	resolvedPluginConfig: WorkersResolvedConfig,
	viteDevServer: vite.ViteDevServer,
	miniflare: Miniflare
): Promise<Map<string, ExportTypes>> {
	// Vite's internal CSS plugins rely on `buildStart` being called for the client environment before modules are transformed in server environments
	// Vite calls this method when initialising the dev server but we need to make requests before that happens
	await viteDevServer.environments.client.pluginContainer.buildStart();

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
