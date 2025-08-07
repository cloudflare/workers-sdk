import { createCLIParser } from "./index";
import type { CommandRegistry } from "./core/CommandRegistry";
import type { DefinitionTreeNode } from "./core/types";

/**
 * EXPERIMENTAL: Get all registered Wrangler commands for documentation generation.
 * This API is experimental and may change without notice.
 *
 * @returns The complete command tree structure with all metadata
 */
export function experimental_getWranglerCommands(): DefinitionTreeNode {
	const wrangler = createCLIParser([]);
	const registry = (wrangler as unknown as { _registry: CommandRegistry })
		._registry;
	return registry.getDefinitionTreeRoot();
}
