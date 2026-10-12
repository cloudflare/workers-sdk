import { partitionExports } from "./exports";
import type { Config } from "./config";
import type { DurableObjectExport } from "./environment";

export type LiveDurableObjectExport = Extract<
	DurableObjectExport,
	{ state?: "created" } | { state: "expecting-transfer" }
>;

/**
 * Returns whether a Durable Object export represents a live class rather than
 * a tombstone.
 *
 * @param exportConfig - The Durable Object export to inspect.
 * @returns Whether the export is in a live lifecycle state.
 */
export function isLiveDurableObjectExport(
	exportConfig: DurableObjectExport
): exportConfig is LiveDurableObjectExport {
	const state = exportConfig.state ?? "created";
	return state === "created" || state === "expecting-transfer";
}

/**
 * Returns a map of exports that are only of type "durable-object".
 */
export function getDurableObjectExports(
	exports: Config["exports"] | undefined
): Record<string, DurableObjectExport> {
	return partitionExports(exports)["durable-object"];
}

export function hasDurableObjectExports(
	exports: Config["exports"] | undefined
): boolean {
	return Object.keys(getDurableObjectExports(exports)).length > 0;
}
