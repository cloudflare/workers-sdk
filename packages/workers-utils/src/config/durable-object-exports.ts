import { partitionExports } from "./exports";
import type { Config } from "./config";
import type { DurableObjectExport } from "./environment";

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
