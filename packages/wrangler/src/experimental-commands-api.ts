import { createCLIParser } from "./index";
import type { DefinitionTreeNode } from "./core/types";

/**
 * EXPERIMENTAL: Get all registered Wrangler commands for documentation generation.
 * This API is experimental and may change without notice.
 *
 * @returns An object containing the command tree structure and global flags
 */
export function experimental_getWranglerCommands(): {
	registry: DefinitionTreeNode;
	globalFlags: ReturnType<typeof createCLIParser>["globalFlags"];
} {
	const { registry, globalFlags } = createCLIParser([]);
	return { registry: registry.getDefinitionTreeRoot(), globalFlags };
}
