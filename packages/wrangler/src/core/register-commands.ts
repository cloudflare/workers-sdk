import { CommonYargsArgv, SubHelp } from "../yargs-types";
import { COMMAND_DEFINITIONS } from "./define-command";
import { wrapCommandDefinition } from "./wrap-command";
import type {
	AliasDefinition,
	Command,
	CommandDefinition,
	NamespaceDefinition,
} from "./define-command";

export default function registerAllCommands(
	yargs: CommonYargsArgv,
	subHelp: SubHelp
) {
	const [root, commands] = createCommandTree("wrangler");

	for (const [segment, node] of root.subtree.entries()) {
		walkTreeAndRegister(segment, node, commands, yargs, subHelp);
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

	for (const def of COMMAND_DEFINITIONS) {
		const segments = def.command.split(" ").slice(1); // eg. ["versions", "secret", "put"]

		let node = root;
		for (const segment of segments) {
			const subtree = node.subtree;
			node = subtree.get(segment) ?? {
				definition: undefined,
				subtree: new Map(),
			};
			subtree.set(segment, node);
		}

		if (node.definition) {
			throw new Error(`Duplicate definition for "${def.command}"`);
		}
		node.definition = def;

		if ("handler" in def) {
			commands.set(def.command, def);
		}
	}

	return [root, commands] as const;
}

function walkTreeAndRegister(
	segment: string,
	{ definition, subtree }: DefinitionTreeNode,
	commands: Map<Command, CommandDefinition>,
	yargs: CommonYargsArgv,
	subHelp: SubHelp
) {
	if (!definition) {
		// TODO: make error message clearer which command is missing namespace definition
		throw new Error(
			`Missing namespace definition for 'wrangler ... ${segment} ...'`
		);
	}

	// rewrite `definition` to copy behaviour/implementation from the (runnable) `real` command
	if ("aliasOf" in definition) {
		const real = commands.get(definition.aliasOf);
		if (!real) {
			throw new Error(
				`No command definition for "${real}" (to alias from "${definition.command}")`
			);
		}

		// this rewrites definition and narrows its type
		// from: CommandDefinition | NamespaceDefinition | AliasDefintion
		//   to: CommandDefinition | NamespaceDefinition
		definition = {
			...definition,
			metadata: {
				...real.metadata,
				...definition.metadata,
				description:
					definition.metadata?.description ?? // use description override
					`Alias for ${real.command}. ${real.metadata.description}`, // or add prefix to real description
				hidden: definition.metadata?.hidden ?? true, // hide aliases by default
			},
			behaviour: real.behaviour,
			args: real.args,
			positionalArgs: real.positionalArgs,
			handler: real.handler,
		};
	}

	// convert our definition into something we can pass to yargs.command
	const def = wrapCommandDefinition(definition);

	// register command
	yargs
		.command(
			segment + def.commandSuffix,
			(def.hidden ? false : def.description) as string, // cast to satisfy typescript overload selection
			(subYargs) => {
				def.defineArgs?.(subYargs);

				for (const [segment, node] of subtree.entries()) {
					walkTreeAndRegister(segment, node, commands, subYargs, subHelp);
				}

				return subYargs;
			},
			def.handler, // TODO: will be possibly undefined when groups/aliases are implemented
			undefined,
			def.deprecatedMessage
		)
		// .epilog(def.statusMessage)
		.command(subHelp);
}
