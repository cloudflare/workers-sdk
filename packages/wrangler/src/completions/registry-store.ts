import type { DefinitionTree } from "../core/types";

/**
 * Module-level store for the command registry definition tree.
 * This is set during CLI initialization and accessed by the fish completions handler.
 */
let definitionTree: DefinitionTree | undefined;

export function setDefinitionTree(tree: DefinitionTree): void {
	definitionTree = tree;
}

export function getDefinitionTree(): DefinitionTree {
	if (!definitionTree) {
		throw new Error("Definition tree not initialized");
	}
	return definitionTree;
}
