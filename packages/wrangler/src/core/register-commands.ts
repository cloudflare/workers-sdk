import { COMMAND_DEFINITIONS } from "./define-command";
import { wrapDefinition } from "./wrap-command";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";
import type {
	AliasDefinition,
	Command,
	CommandDefinition,
	NamespaceDefinition,
} from "./define-command";

export class CommandRegistrationError extends Error {}

export function createCommandRegister(
	yargs: CommonYargsArgv,
	subHelp: SubHelp
) {
	const tree = createCommandTree();

	return {
		registerAll() {
			for (const [segment, node] of tree.entries()) {
				walkTreeAndRegister(segment, node, yargs, subHelp);
				tree.delete(segment);
			}
		},
		registerNamespace(namespace: string) {
			const node = tree.get(namespace);

			if (!node) {
				throw new CommandRegistrationError(
					`No definition found for namespace '${namespace}'`
				);
			}

			tree.delete(namespace);
			walkTreeAndRegister(namespace, node, yargs, subHelp);
		},
	};
}

type DefinitionTreeNode = {
	definition?: CommandDefinition | NamespaceDefinition | AliasDefinition;
	subtree: DefinitionTree;
};
type DefinitionTree = Map<string, DefinitionTreeNode>;

type ResolvedDefinitionTreeNode = {
	definition?: CommandDefinition | NamespaceDefinition;
	subtree: ResolvedDefinitionTree;
};
type ResolvedDefinitionTree = Map<string, ResolvedDefinitionTreeNode>;

/**
 * Converts a flat list of COMMAND_DEFINITIONS into a tree of defintions
 * which can be passed to yargs builder api
 *
 * For example,
 *      wrangler dev
 *      wrangler deploy
 *      wrangler versions upload
 *      wrangler versions deploy
 *
 * Will be transformed into:
 *      wrangler
 *           dev
 *           deploy
 *           versions
 *               upload
 *               deploy
 */
function createCommandTree() {
	const root: DefinitionTreeNode = { subtree: new Map() };
	const aliases = new Set<AliasDefinition>();

	// STEP 1: Create tree from flat definitions array

	for (const def of COMMAND_DEFINITIONS) {
		const node = createNodeFor(def.command, root);

		if (node.definition) {
			throw new CommandRegistrationError(
				`Duplicate definition for "${def.command}"`
			);
		}
		node.definition = def;

		if ("aliasOf" in def) {
			aliases.add(def);
		}
	}

	// STEP 2: Resolve all aliases to their real definitions

	const MAX_HOPS = 5; // reloop to allow aliases of aliases (to avoid infinite loop, limit to 5 hops)
	for (let hops = 0; hops < MAX_HOPS && aliases.size > 0; hops++) {
		for (const def of aliases) {
			const realNode = findNodeFor(def.aliasOf, root);
			const real = realNode?.definition;
			if (!real || "aliasOf" in real) {
				continue;
			}

			const node = createNodeFor(def.command, root);

			node.definition = {
				...real,
				command: def.command,
				metadata: {
					...real.metadata,
					...def.metadata,
					description:
						def.metadata?.description ?? // use description override
						`Alias for "${real.command}". ${real.metadata.description}`, // or add prefix to real description
					hidden: def.metadata?.hidden ?? true, // hide aliases by default
				},
			};

			node.subtree = realNode.subtree;

			aliases.delete(def);
		}
	}

	if (aliases.size > 0) {
		throw new CommandRegistrationError(
			`Alias of alias encountered greater than ${MAX_HOPS} hops`
		);
	}

	// STEP 3: validate missing namespace definitions

	for (const [command, node] of walk("wrangler", root)) {
		if (!node.definition) {
			throw new CommandRegistrationError(
				`Missing namespace definition for '${command}'`
			);
		}
	}

	// STEP 4: return the resolved tree

	return root.subtree as ResolvedDefinitionTree;
}

function walkTreeAndRegister(
	segment: string,
	{ definition, subtree }: ResolvedDefinitionTreeNode,
	yargs: CommonYargsArgv,
	subHelp: SubHelp
) {
	if (!definition) {
		throw new CommandRegistrationError(
			`Missing namespace definition for '${segment}'`
		);
	}

	// convert our definition into something we can pass to yargs.command
	const def = wrapDefinition(definition);

	// register command
	yargs.command(
		segment + def.commandSuffix,
		(def.hidden ? false : def.description) as string, // cast to satisfy typescript overload selection
		(subYargs) => {
			if (def.defineArgs) {
				subYargs = def.defineArgs(subYargs);
			} else {
				// this is our hacky way of printing --help text for incomplete commands
				// eg `wrangler kv namespace` will run `wrangler kv namespace --help`
				subYargs = subYargs.command(subHelp);
			}

			for (const [nextSegment, nextNode] of subtree.entries()) {
				subYargs = walkTreeAndRegister(
					nextSegment,
					nextNode,
					subYargs,
					subHelp
				);
			}

			return subYargs;
		},
		def.handler // TODO: replace hacky subHelp with default handler impl (def.handler will be undefined for namespaces, so set default handler to print subHelp)
	);

	return yargs;
}

// #region utils
function createNodeFor(command: Command, root: DefinitionTreeNode) {
	const segments = command.split(" ").slice(1); // eg. ["versions", "secret", "put"]

	let node = root;
	for (const segment of segments) {
		const subtree = node.subtree;
		let child = subtree.get(segment);
		if (!child) {
			child = {
				definition: undefined,
				subtree: new Map(),
			};
			subtree.set(segment, child);
		}

		node = child;
	}

	return node;
}
function findNodeFor(command: Command, root: DefinitionTreeNode) {
	const segments = command.split(" ").slice(1); // eg. ["versions", "secret", "put"]

	let node = root;
	for (const segment of segments) {
		const subtree = node.subtree;
		const child = subtree.get(segment);
		if (!child) {
			return undefined;
		}

		node = child;
	}

	return node;
}
function* walk(
	command: Command,
	parent: DefinitionTreeNode
): IterableIterator<[Command, DefinitionTreeNode]> {
	for (const [segment, node] of parent.subtree) {
		yield [`${command} ${segment}`, node];
		yield* walk(`${command} ${segment}`, node);
	}
}
// #endregion
