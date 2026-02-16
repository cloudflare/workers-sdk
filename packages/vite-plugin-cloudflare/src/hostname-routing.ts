import type { ExportTypes } from "./export-types";
import type { Worker } from "./plugin-config";

/**
 * Resolves entrypoint routing for a single worker based on its `exposeEntrypoints` config.
 *
 * Returns the `entrypointSubdomains` record (export name -> alias) to pass to the
 * worker's miniflare options, or `undefined` if the worker doesn't opt in.
 * Miniflare handles validation, normalization, and collision detection.
 *
 * - `true`: all exports (including default) are exposed with export names as aliases
 * - `Record<string, string | boolean>`: explicit mapping of export names to aliases
 *   (`true` uses the export name, `false` excludes the entrypoint)
 */
export function resolveEntrypointRouting(
	worker: Worker,
	exportTypes: ExportTypes
): Record<string, string> | undefined {
	if (!worker.exposeEntrypoints) {
		return undefined;
	}

	const entrypoints: Record<string, string> = {};

	if (worker.exposeEntrypoints === true) {
		// The default export is always present on a worker module but
		// exportTypes doesn't include it, so add it explicitly.
		entrypoints["default"] = "default";
		for (const [exportName] of Object.entries(exportTypes ?? {})) {
			entrypoints[exportName] = exportName;
		}
	} else {
		for (const [exportName, aliasOrTrue] of Object.entries(
			worker.exposeEntrypoints
		)) {
			if (aliasOrTrue === false) {
				continue;
			}
			entrypoints[exportName] = aliasOrTrue === true ? exportName : aliasOrTrue;
		}
	}

	return entrypoints;
}
