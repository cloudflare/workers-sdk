import assert from "node:assert";
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
		for (const value of Object.values(worker.config.env ?? {})) {
			if (
				value.type === "worker" &&
				value.exportName !== undefined &&
				value.exportName !== "default"
			) {
				const exportNames = workerNameToWorkerEntrypointExportsMap.get(
					value.worker
				);

				exportNames?.add(value.exportName);
			}
		}
		for (const [name, value] of Object.entries(worker.config.exports ?? {})) {
			if (value.type === "worker") {
				workerNameToWorkerEntrypointExportsMap
					.get(worker.config.name)
					?.add(name);
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
				Object.entries(worker.config.exports ?? {})
					.filter(
						([, value]) =>
							value.type === "durable-object" &&
							(value.state === undefined ||
								value.state === "created" ||
								value.state === "expecting-transfer")
					)
					.map(([name]) => name)
			),
		])
	);

	for (const worker of workers) {
		for (const [name, value] of Object.entries(worker.config.env ?? {})) {
			if (value.type !== "durable-object") {
				continue;
			}
			if (value.worker !== worker.config.name) {
				const exportNames = workerNameToDurableObjectExportsMap.get(
					value.worker
				);

				exportNames?.add(value.exportName);
			} else {
				const exportNames = workerNameToDurableObjectExportsMap.get(
					worker.config.name
				);

				exportNames?.add(value.exportName ?? name);
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

	// TODO: Add Workflow entrypoint exports when Workflows are supported by
	// cloudflare.config.ts.
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
