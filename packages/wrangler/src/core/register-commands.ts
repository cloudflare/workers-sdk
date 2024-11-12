import assert from "node:assert";
import chalk from "chalk";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { CommandRegistrationError, DefinitionTreeRoot } from "./define-command";
import { demandSingleValue } from "./helpers";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";
import type {
	Command,
	CommandDefinition,
	DefinitionTreeNode,
	HandlerArgs,
	InternalDefinition,
	NamedArgDefinitions,
} from "./define-command";

const betaCmdColor = "#BD5B08";

export function createCommandRegister(
	yargs: CommonYargsArgv,
	subHelp: SubHelp
) {
	const tree = DefinitionTreeRoot.subtree;
	const registeredNamespaces = new Set<string>();

	return {
		registerAll() {
			for (const [segment, node] of tree.entries()) {
				if (registeredNamespaces.has(segment)) {
					continue;
				}
				registeredNamespaces.add(segment);
				walkTreeAndRegister(
					segment,
					node,
					yargs,
					subHelp,
					`wrangler ${segment}`
				);
			}
		},
		registerNamespace(namespace: string) {
			if (registeredNamespaces.has(namespace)) {
				return;
			}

			const node = tree.get(namespace);

			if (!node?.definition) {
				throw new CommandRegistrationError(
					`Missing namespace definition for 'wrangler ${namespace}'`
				);
			}

			registeredNamespaces.add(namespace);
			walkTreeAndRegister(
				namespace,
				node,
				yargs,
				subHelp,
				`wrangler ${namespace}`
			);
		},
	};
}

function walkTreeAndRegister(
	segment: string,
	node: DefinitionTreeNode,
	yargs: CommonYargsArgv,
	subHelp: SubHelp,
	fullCommand: Command
) {
	if (!node.definition) {
		throw new CommandRegistrationError(
			`Missing namespace definition for '${fullCommand}'`
		);
	}

	const aliasOf = node.definition.type === "alias" && node.definition.aliasOf;
	const { definition: def, subtree } = resolveDefinitionNode(node);

	if (aliasOf) {
		def.metadata.description += `\n\nAlias for "${aliasOf}".`;
	}

	if (def.metadata.deprecated) {
		def.metadata.deprecatedMessage ??= `Deprecated: "${def.command}" is deprecated`;
	}

	if (def.metadata.status !== "stable") {
		def.metadata.description += chalk.hex(betaCmdColor)(
			` [${def.metadata.status}]`
		);

		const indefiniteArticle = "aeiou".includes(def.metadata.status[0])
			? "an"
			: "a";
		def.metadata.statusMessage ??= `🚧 \`${def.command}\` is ${indefiniteArticle} ${def.metadata.status} command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose`;
	}

	if (def.type === "command") {
		// inference from positionalArgs
		const commandPositionalArgsSuffix = def.positionalArgs
			?.map((key) => {
				const { demandOption, array } = def.args?.[key] ?? {};
				return demandOption
					? `<${key}${array ? ".." : ""}>` // <key> or <key..>
					: `[${key}${array ? ".." : ""}]`; // [key] or [key..]
			})
			.join(" ");

		if (commandPositionalArgsSuffix) {
			segment += " " + commandPositionalArgsSuffix;
		}
	}

	// register command
	yargs.command(
		segment,
		(def.metadata.hidden ? false : def.metadata.description) as string, // cast to satisfy typescript overload selection
		function builder(subYargs) {
			if (def.type === "command") {
				const args = def.args ?? {};

				yargs.options(args);

				// Yargs offers an `array: true` option that will always coerces the value to an array
				// e.g. `--name foo` becomes `{ name: ["foo"] }` instead of `{ name: "foo" }`
				// However, non-array arguments can still receives multiple values
				// e.g. `--name foo --name bar` becomes `{ name: ["foo", "bar"] }` regardless of the `array` setting
				// @see https://github.com/yargs/yargs/issues/1318
				for (const [key, opt] of Object.entries(args)) {
					if (!opt.array) {
						yargs.check(demandSingleValue(key));
					}
				}

				for (const key of def.positionalArgs ?? []) {
					yargs.positional(key, args[key]);
				}
			} else if (def.type === "namespace") {
				// this is our hacky way of printing --help text for incomplete commands
				// eg `wrangler kv namespace` will run `wrangler kv namespace --help`
				subYargs.command(subHelp);
			}

			for (const [nextSegment, nextNode] of subtree.entries()) {
				walkTreeAndRegister(
					nextSegment,
					nextNode,
					subYargs,
					subHelp,
					`${fullCommand} ${nextSegment}`
				);
			}
		},
		def.type === "command" ? createHandler(def) : undefined
	);
}

function createHandler(def: CommandDefinition) {
	return async function handler(args: HandlerArgs<NamedArgDefinitions>) {
		// eslint-disable-next-line no-useless-catch
		try {
			if (def.behaviour?.printBanner !== false) {
				await printWranglerBanner();
			}

			if (def.metadata.deprecated) {
				logger.warn(def.metadata.deprecatedMessage);
			}
			if (def.metadata.statusMessage) {
				logger.warn(def.metadata.statusMessage);
			}

			// TODO(telemetry): send command started event

			await def.validateArgs?.(args);

			await def.handler(args, {
				config: readConfig(
					args.config,
					args,
					undefined,
					!(def.behaviour?.printConfigWarnings ?? true)
				),
				errors: { UserError, FatalError },
				logger,
				fetchResult,
			});

			// TODO(telemetry): send command completed event
		} catch (err) {
			// TODO(telemetry): send command errored event
			throw err;
		}
	};
}

// #region utils

/**
 * Returns a non-alias (resolved) definition and subtree with inherited metadata values
 *
 * Inheriting metadata values means deprecated namespaces also automatically
 * deprecates its subcommands unless the subcommand overrides it.
 * The same inheritiance applies to deprecation-/status-messages, hidden, etc...
 */
function resolveDefinitionNode(
	node: DefinitionTreeNode,
	root = DefinitionTreeRoot
) {
	assert(node.definition);
	const chain = resolveDefinitionChain(node.definition, root);

	// get non-alias (resolved) definition
	const resolvedDef = chain.find((def) => def.type !== "alias");
	assert(resolvedDef);

	// get subtree for the resolved node
	const { subtree } =
		node.definition.type !== "alias"
			? node
			: findNodeFor(resolvedDef.command, root) ?? node;

	const definition: InternalDefinition = {
		// take all properties from the resolved alias
		...resolvedDef,
		// keep the original command
		command: node.definition.command,
		// flatten metadata from entire chain (decreasing precedence)
		metadata: Object.assign({}, ...chain.map((def) => def.metadata).reverse()),
	};

	return { definition, subtree };
}

/**
 * Returns a list of definitions starting from `def`
 *  walking "up" the tree to the `root` and hopping "across" the tree for aliases
 *
 * eg. `wrangler versions secret put` => `wrangler versions secret` => `wrangler versions`
 * eg. `wrangler kv:key put` => `wrangler kv:key` => `wrangler kv key` => `wrangler kv`
 */
function resolveDefinitionChain(
	def: InternalDefinition,
	root = DefinitionTreeRoot
) {
	const chain: InternalDefinition[] = [];
	const stringifyChain = (...extra: InternalDefinition[]) =>
		[...chain, ...extra].map(({ command }) => `"${command}"`).join(" => ");

	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (chain.includes(def)) {
			throw new CommandRegistrationError(
				`Circular reference detected for alias definition: "${def.command}" (resolving from ${stringifyChain(def)})`
			);
		}

		chain.push(def);

		const node =
			def.type === "alias"
				? findNodeFor(def.aliasOf, root)
				: findParentFor(def.command, root);

		if (node === root) {
			return chain;
		}

		if (!node?.definition) {
			throw new CommandRegistrationError(
				`Missing definition for "${def.type === "alias" ? def.aliasOf : def.command}" (resolving from ${stringifyChain()})`
			);
		}

		def = node.definition;
	}
}

/**
 * Finds the parent node for a command by removing the last segment of the command and calling findNodeFor
 *
 * eg. findParentFor("wrangler kv key") => findNodeFor("wrangler kv")
 */
function findParentFor(command: Command, root = DefinitionTreeRoot) {
	const parentCommand = command.split(" ").slice(0, -2).join(" ") as Command;

	return findNodeFor(parentCommand, root);
}

/**
 * Finds a node by segmenting the command and indexing through the subtrees.
 *
 *  eg. findNodeFor("wrangler versions secret put") => root.subtree.get("versions").subtree.get("secret").subtree.get("put")
 *
 * Returns `undefined` if the node does not exist.
 */
function findNodeFor(command: Command, root = DefinitionTreeRoot) {
	const segments = command.split(" ").slice(1); // eg. ["versions", "secret", "put"]

	let node = root;
	for (const segment of segments) {
		const child = node.subtree.get(segment);
		if (!child) {
			return undefined;
		}

		node = child;
	}

	return node;
}

// #endregion
