import type { CfModule } from "@cloudflare/workers-utils";

/**
 * Remove duplicate modules from the array.
 *
 * Prefer modules towards the end of the array in the case of a collision by name.
 */
export function dedupeModulesByName(modules: CfModule[]): CfModule[] {
	return Object.values(
		modules.reduce(
			(moduleMap, module) => {
				moduleMap[module.name] = module;
				return moduleMap;
			},
			{} as Record<string, CfModule>
		)
	);
}
