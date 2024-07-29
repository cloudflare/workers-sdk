import type { CfModuleType, CfScriptFormat } from "./worker";

/**
 * Compute the entry-point module type from the bundle format.
 */
export function getBundleType(
	format: CfScriptFormat,
	file?: string
): CfModuleType {
	if (file && file.endsWith(".py")) {
		return "python";
	}
	return format === "modules" ? "esm" : "commonjs";
}
