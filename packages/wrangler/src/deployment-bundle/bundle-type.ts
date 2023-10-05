import type { CfModuleType, CfScriptFormat } from "./worker";

/**
 * Compute the entry-point type from the bundle format.
 */
export function getBundleType(format: CfScriptFormat): CfModuleType {
	return format === "modules" ? "esm" : "commonjs";
}
