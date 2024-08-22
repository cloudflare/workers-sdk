import assert from "assert";
import { CommonYargsArgv } from "../yargs-types";
import { COMMAND_DEFINITIONS } from "./define-command";
import { wrapCommandDefinition } from "./wrap-command";
import type {
	AliasDefinition,
	BaseNamedArgDefinitions,
	Command,
	CommandDefinition,
	HandlerArgs,
	NamespaceDefinition,
} from "./define-command";

export class CommandRegistrationError extends Error {}

export default function registerAllCommands(yargs: CommonYargsArgv) {
	const [root, commands] = createCommandTree("wrangler");

	for (const [segment, node] of root.subtree.entries()) {
		yargs = walkTreeAndRegister(segment, node, commands, yargs);
	}
}

type DefinitionTreeNode = {
	definition?: CommandDefinition | NamespaceDefinition | AliasDefinition;
	subtree: DefinitionTree;
};
type DefinitionTree = Map<string, DefinitionTreeNode>;

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
function createCommandTree(prefix: string) {
	const root: DefinitionTreeNode = { subtree: new Map() };
	const commands = new Map<Command, CommandDefinition>();
	const aliases = new Set<AliasDefinition>();

	function getNodeFor(command: Command) {
		const segments = command.split(" ").slice(1); // eg. ["versions", "secret", "put"]

		let node = root;
		for (const segment of segments) {
			const subtree = node.subtree;
			node = subtree.get(segment) ?? {
				definition: undefined,
				subtree: new Map(),
			};
			subtree.set(segment, node);
		}

		return node;
	}

	for (const def of COMMAND_DEFINITIONS) {
		const node = getNodeFor(def.command);

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

	// reloop to allow aliases of aliases
	const MAX_HOPS = 5;
	for (let hops = 0; hops < MAX_HOPS && aliases.size > 0; hops++) {
		for (const def of aliases) {
			const realNode = getNodeFor(def.aliasOf); // TODO: this might be creating unnecessary undefined definitions
			const real = realNode.definition;
			if (!real || "aliasOf" in real) continue;

			const node = getNodeFor(def.command);

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

	return [root, commands] as const;
}

function walkTreeAndRegister(
	segment: string,
	{ definition, subtree }: DefinitionTreeNode,
	commands: Map<Command, CommandDefinition>,
	yargs: CommonYargsArgv
) {
	if (!definition) {
		// TODO: make error message clearer which command is missing namespace definition
		throw new CommandRegistrationError(
			`Missing namespace definition for 'wrangler ... ${segment} ...'`
		);
	}

	// cannot be AliasDefinition anymore
	assert(
		!("aliasOf" in definition),
		`Unexpected AliasDefinition for "${definition.command}"`
	);

	// convert our definition into something we can pass to yargs.command
	const def = wrapCommandDefinition(definition);

	// register command
	yargs.command(
		segment + def.commandSuffix,
		(def.hidden ? false : def.description) as string, // cast to satisfy typescript overload selection
		(subYargs) => {
			if (def.defineArgs) {
				subYargs = def.defineArgs(subYargs);
			}

			for (const [segment, node] of subtree.entries()) {
				subYargs = walkTreeAndRegister(segment, node, commands, subYargs);
			}

			return subYargs;
		},
		def.handler // TODO: subHelp (def.handler will be undefined for namespaces, so set default handler to print subHelp)
	);

	return yargs;
}
