import assert from "node:assert";
import chalk from "chalk";
import {
	isAliasDefinition,
	isCommandDefinition,
	isNamespaceDefinition,
} from "./helpers";
import type { CreateCommandResult } from "./create-command";
import type {
	AliasDefinition,
	Command,
	DefinitionTree,
	DefinitionTreeNode,
	InternalDefinition,
	Metadata,
	MetadataCategory,
	NamedArgDefinitions,
	NamespaceDefinition,
} from "./types";

const BETA_CMD_COLOR = "#BD5B08";

/**
 * Map of category names to the top-level command segments that belong to them.
 * Used for grouping commands in the help output.
 */
type CategoryMap = Map<MetadataCategory, Array<string>>;

/**
 * The default order for categories in the help output.
 * Categories not in this list will appear after these in alphabetical order.
 */
const COMMAND_CATEGORY_ORDER = [
	"Account",
	"Compute & AI",
	"Storage & databases",
	"Networking & security",
] satisfies Array<MetadataCategory>;

/**
 * Class responsible for registering and managing commands within a command registry.
 */
export class CommandRegistry {
	/**
	 * Root node of the definition tree.
	 */
	#DefinitionTreeRoot: DefinitionTreeNode;

	/**
	 * Set of registered namespaces.
	 */
	#registeredNamespaces: Set<string>;

	/**
	 * Function to register a command.
	 */
	#registerCommand: RegisterCommand;

	/**
	 * The tree structure representing all command definitions.
	 */
	#tree: DefinitionTree;

	/**
	 * Map of category names to command segments.
	 * Used for grouping commands in the help output.
	 */
	#categories: CategoryMap;

	/**
	 * Initializes the command registry with the given command registration function.
	 */
	constructor(registerCommand: RegisterCommand) {
		this.#DefinitionTreeRoot = { subtree: new Map() };
		this.#registeredNamespaces = new Set<string>();
		this.#registerCommand = registerCommand;
		this.#tree = this.#DefinitionTreeRoot.subtree;
		this.#categories = new Map();
	}

	/**
	 * Defines multiple commands and their corresponding definitions.
	 */
	define(
		defs: {
			command: Command;
			definition:
				| AliasDefinition
				| CreateCommandResult<NamedArgDefinitions>
				| NamespaceDefinition;
		}[]
	) {
		for (const def of defs) {
			this.#defineOne(def);
		}
	}

	getDefinitionTreeRoot() {
		return this.#DefinitionTreeRoot;
	}

	/**
	 * Registers all commands in the command registry, walking through the definition tree.
	 */
	registerAll() {
		for (const [segment, node] of this.#tree.entries()) {
			if (this.#registeredNamespaces.has(segment)) {
				continue;
			}
			this.#registeredNamespaces.add(segment);
			this.#walkTreeAndRegister(segment, node, `wrangler ${segment}`);
		}
	}

	/**
	 * Registers a specific namespace if not already registered.
	 * TODO: Remove this once all commands use the command registry.
	 * See https://github.com/cloudflare/workers-sdk/pull/7357#discussion_r1862138470 for more details.
	 */
	registerNamespace(namespace: string) {
		if (this.#registeredNamespaces.has(namespace)) {
			return;
		}

		const node = this.#tree.get(namespace);

		if (!node?.definition) {
			throw new CommandRegistrationError(
				`Missing namespace definition for 'wrangler ${namespace}'`
			);
		}

		this.#registeredNamespaces.add(namespace);
		this.#walkTreeAndRegister(namespace, node, `wrangler ${namespace}`);
	}

	/**
	 * Returns the map of categories to command segments, ordered according to
	 * the category order. Commands within each category are sorted alphabetically.
	 * Used for grouping commands in the help output.
	 */
	get orderedCategories(): CategoryMap {
		const orderedCategories: CategoryMap = new Map();
		for (const category of COMMAND_CATEGORY_ORDER) {
			if (!this.#categories.has(category)) {
				continue;
			}

			const commands = this.#categories.get(category) ?? [];
			orderedCategories.set(category, [...commands].sort());
		}

		const remainingCategories = Array.from(this.#categories.keys())
			.filter(
				(cat) => !COMMAND_CATEGORY_ORDER.includes(cat as MetadataCategory)
			)
			.sort();
		for (const category of remainingCategories) {
			const commands = this.#categories.get(category) ?? [];
			orderedCategories.set(category, [...commands].sort());
		}

		return orderedCategories;
	}

	/**
	 * Registers a category for a legacy command that doesn't use the CommandRegistry.
	 * This is used for commands like `containers`, `pubsub`, etc, that use the old yargs pattern.
	 */
	registerLegacyCommandCategory(
		command: string,
		category: MetadataCategory
	): void {
		const existing = this.#categories.get(category) ?? [];
		if (existing.includes(command)) {
			return;
		}

		existing.push(command);
		this.#categories.set(category, existing);
	}

	/**
	 * Defines a single command and its corresponding definition.
	 */
	#defineOne({
		command,
		definition,
	}: {
		command: Command;
		definition:
			| AliasDefinition
			| CreateCommandResult<NamedArgDefinitions>
			| NamespaceDefinition;
	}) {
		if (isAliasDefinition(definition)) {
			this.#upsertDefinition({ type: "alias", command, ...definition });
		}

		if (isCommandDefinition(definition)) {
			this.#upsertDefinition({ type: "command", command, ...definition });
			this.#trackCategory(command, definition.metadata?.category);
		} else if (isNamespaceDefinition(definition)) {
			this.#upsertDefinition({ type: "namespace", command, ...definition });
			this.#trackCategory(command, definition.metadata?.category);
		}
	}

	/**
	 * Adds a top-level command (e.g., "wrangler r2") to the `#categories` map for help output grouping.
	 * Subcommands (e.g., "wrangler r2 bucket") are ignored since the parent already represents them.
	 */
	#trackCategory(
		command: Command,
		category: MetadataCategory | undefined
	): void {
		const segments = command.split(" ").slice(1);

		// Only track categories for top-level commands (e.g., "wrangler r2", not "wrangler r2 bucket")
		if (segments.length !== 1) {
			return;
		}

		if (!category) {
			return;
		}

		const segment = segments[0];
		const existing = this.#categories.get(category) ?? [];
		if (!existing.includes(segment)) {
			existing.push(segment);
			this.#categories.set(category, existing);
		}
	}

	/**
	 * Finds a node in the definition tree for the given command.
	 *
	 * @example
	 *
	 * this.#upsertDefinition({
	 *   type: 'command',
	 *   command: 'wrangler hello',
	 *   handler: "helloHandlerFunction",
	 *   metadata: {
	 *     description: "Say hello",
	 *     status: "stable",
	 *     owner: "Cloudflare Team"
	 *   }
	 * });
	 *
	 * const node = this.#findNodeFor('wrangler hello');
	 * console.log(node.definition.command); // Output: 'wrangler hello'
	 *
	 * const nonExistentNode = this.#findNodeFor('wrangler unknown');
	 * console.log(nonExistentNode); // Output: undefined
	 */
	#findNodeFor(command: Command) {
		const segments = command.split(" ").slice(1); // eg. ["versions", "secret", "put"]

		let node = this.#DefinitionTreeRoot;
		for (const segment of segments) {
			const child = node.subtree.get(segment);
			if (!child) {
				return undefined;
			}

			node = child;
		}

		return node;
	}

	/**
	 * Finds the parent node of a command in the tree.
	 *
	 * @example
	 *
	 * this.#upsertDefinition({
	 *   type: 'namespace',
	 *   command: 'wrangler interact',
	 *   metadata: {
	 *     description: "Greet",
	 *     status: "stable",
	 *   }
	 * });
	 * this.#upsertDefinition({
	 *   type: 'command',
	 *   command: 'wrangler interact hello',
	 *   handler: () => {},
	 *   metadata: {
	 *     description: "Say hello",
	 *     status: "stable",
	 *     owner: "Cloudflare Team"
	 *   }
	 * });
	 *
	 * const parentNode = this.#findParentFor('wrangler interact hello');
	 * console.log(parentNode.definition.command); // Output: 'wrangler interact'
	 */
	#findParentFor(command: Command) {
		const parentCommand = command.split(" ").slice(0, -2).join(" ") as Command;

		return this.#findNodeFor(parentCommand);
	}

	/**
	 * Resolves the definition chain for a given command, following aliases and parent commands.
	 *
	 * @example
	 *
	 * this.#upsertDefinition({
	 *   type: 'alias',
	 *   command: 'wrangler greet',
	 *   aliasOf: 'wrangler hello',
	 *   metadata: {
	 *     description: "A greeting alias for hello",
	 *     status: "stable"
	 *   }
	 * });
	 *
	 * const chain = this.#resolveDefinitionChain({
	 *   type: 'alias',
	 *   command: 'wrangler greet',
	 *   aliasOf: 'wrangler hello',
	 *   metadata: {
	 *     description: "A greeting alias for hello",
	 *     status: "stable"
	 *   }
	 * });
	 * console.log(chain.map(def => def.command)); // Output: ['"wrangler greet" => "wrangler hello"']
	 *
	 * // The example throws an error because of a circular reference
	 * this.#upsertDefinition({
	 *   type: 'alias',
	 *   command: 'wrangler hello',
	 *   aliasOf: 'wrangler greet',
	 *   metadata: {
	 *     description: "Alias for greet",
	 *     status: "stable"
	 *   }
	 * });
	 * const chain = this.#resolveDefinitionChain({
	 *   type: 'alias',
	 *   command: 'wrangler greet',
	 *   aliasOf: 'wrangler hello',
	 *   metadata: {
	 *     description: "A greeting alias for hello",
	 *     status: "stable"
	 *   }
	 * });
	 */
	#resolveDefinitionChain(def: InternalDefinition) {
		const chain: InternalDefinition[] = [];
		const stringifyChain = (...extra: InternalDefinition[]) =>
			[...chain, ...extra].map(({ command }) => `"${command}"`).join(" => ");

		while (true) {
			if (chain.includes(def)) {
				throw new CommandRegistrationError(
					`Circular reference detected for alias definition: "${def.command}" (resolving from ${stringifyChain(def)})`
				);
			}

			chain.push(def);

			const node =
				def.type === "alias"
					? this.#findNodeFor(def.aliasOf)
					: this.#findParentFor(def.command);

			if (node === this.#DefinitionTreeRoot) {
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
	 * Resolves a definition node, returning a non-alias definition and its associated metadata.
	 *
	 * @example
	 *
	 * this.#upsertDefinition({
	 *   type: 'command',
	 *   command: 'wrangler hello',
	 *   handler: (args, { config }) => {},
	 *   metadata: {
	 *     description: "Say hello",
	 *     status: "stable",
	 *     owner: "Cloudflare Team"
	 *   }
	 * });
	 * this.#upsertDefinition({
	 *   type: 'alias',
	 *   command: 'wrangler greet',
	 *   aliasOf: 'wrangler hello',
	 *   metadata: {
	 *     description: "A greeting alias for hello",
	 *     status: "stable"
	 *   }
	 * });
	 *
	 * const { definition, subtree } = this.#resolveDefinitionNode({
	 *   type: 'alias',
	 *   command: 'wrangler greet',
	 *   aliasOf: 'wrangler hello',
	 *   metadata: {
	 *     description: "A greeting alias for hello",
	 *     status: "stable"
	 *   }
	 * });
	 * console.log(definition.command); // Output: 'wrangler hello'
	 * console.log(subtree); // Output: empty Map if 'wrangler hello' has no further subcommands
	 */
	#resolveDefinitionNode(node: DefinitionTreeNode) {
		assert(node.definition);
		const chain = this.#resolveDefinitionChain(node.definition);

		// get non-alias (resolved) definition
		const resolvedDef = chain.find((def) => def.type !== "alias");
		assert(resolvedDef);

		// get subtree for the resolved node
		const { subtree } =
			node.definition.type !== "alias"
				? node
				: this.#findNodeFor(resolvedDef.command) ?? node;

		const definition: InternalDefinition = {
			// take all properties from the resolved alias
			...resolvedDef,
			// keep the original command
			command: node.definition.command,
			// flatten metadata from entire chain (decreasing precedence)
			metadata: Object.assign(
				{},
				...chain.map((def) => def.metadata).reverse()
			),
		};

		return { definition, subtree };
	}

	/**
	 * Inserts or updates a command definition in the tree. When a command, alias, or namespace is added to the tree
	 * it will first split it into segments, e.g.
	 *
	 * `wrangler namespace-a` => ["namespace-a", "command-a"]
	 *
	 * Then it will walk through the segments and create a new node for each segment, creating an empty definition and
	 * a subtree for each. The next segment is then defined on that subtree.
	 *
	 * When the last segment is reached, the definition is added. This way, only commands and aliases have definitions, while
	 * namespaces are just nodes in the tree.
	 *
	 * @example
	 *
	 * this.#upsertDefinition({ type: 'command', command: 'wrangler command-a', ... });
	 * this.#upsertDefinition({ type: 'namespace', command: 'wrangler namespace-b', ... });
	 * this.#upsertDefinition({ type: 'command', command: 'wrangler command-b', ... });
	 *
	 * // Resulting tree:
	 *
	 * this.#DefinitionTreeRoot: {
	 *   "subtree": {
	 *     "command-a": {
	 *       "definition": {
	 *         "type": "command",
	 *         "command": "wrangler command-a",
	 *         "handler": (args, { config }) => {},
	 *         "metadata": { "description": "Command a" }
	 *       },
	 *       "subtree": new Map()
	 *     },
	 *     "namespace-b": {
	 *       "subtree": {
	 *         "command-b": {
	 *           "definition": {
	 *             "type": "command",
	 *             "command": "wrangler namespace-b command-b",
	 *             "handler": (args, { config }) => {},
	 *             "metadata": { "description": "Command b" }
	 *           },
	 *           "subtree": new Map()
	 *         }
	 *       }
	 *     }
	 *   }
	 * }
	 */
	#upsertDefinition(def: InternalDefinition) {
		const segments = def.command.split(" ").slice(1); // eg. ["versions", "secret", "put"]

		let node = this.#DefinitionTreeRoot;
		for (const segment of segments) {
			const subtree = node.subtree;
			let child = subtree.get(segment);

			// If the child doesn't exist, then create it as a namespace (i.e. without a definition)
			if (!child) {
				child = {
					definition: undefined,
					subtree: new Map(),
				};
				subtree.set(segment, child);
			}

			node = child;
		}

		// Now that all the segments are created, we can set its definition.
		// Given that `node` is currently pointing to the last segment, the definition will be set
		// at that point in the tree. However, if it already exists, then this command has already
		// been defined and we should throw an error.
		if (node.definition) {
			throw new CommandRegistrationError(
				`Duplicate definition for "${def.command}"`
			);
		}

		node.definition = def;

		return node;
	}

	/**
	 * Walks through the definition tree and registers all subcommands for a given segment.
	 */
	#walkTreeAndRegister(
		segment: string,
		node: DefinitionTreeNode,
		fullCommand: Command
	) {
		if (!node.definition) {
			throw new CommandRegistrationError(
				`Missing namespace definition for '${fullCommand}'`
			);
		}

		const aliasOf = node.definition.type === "alias" && node.definition.aliasOf;
		const { definition: def, subtree } = this.#resolveDefinitionNode(node);

		if (aliasOf) {
			def.metadata.description += `\n\nAlias for "${aliasOf}".`;
		}

		if (def.metadata.deprecated) {
			def.metadata.deprecatedMessage ??= `Deprecated: "${def.command}" is deprecated`;
		}

		if (def.metadata.status !== "stable") {
			def.metadata.description += chalk.hex(BETA_CMD_COLOR)(
				` [${def.metadata.status}]`
			);

			def.metadata.statusMessage ??= constructStatusMessage(
				def.command,
				def.metadata.status
			);
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

		// Create the next iteration of the walker and pass it to the register function so that it can be called
		// after the current command has been registered.
		const registerSubTreeCallback = () => {
			for (const [nextSegment, nextNode] of subtree.entries()) {
				this.#walkTreeAndRegister(
					nextSegment,
					nextNode,
					`${fullCommand} ${nextSegment}`
				);
			}
		};

		this.#registerCommand(segment, def, registerSubTreeCallback);
	}
}

/**
 * Custom error class for command registration issues.
 */
export class CommandRegistrationError extends Error {}

/**
 * Type for the function used to register commands.
 */
type RegisterCommand = (
	segment: string,
	def: InternalDefinition,
	registerSubTreeCallback: () => void
) => void;

export function constructStatusMessage(
	command: string,
	status: Metadata["status"]
) {
	const indefiniteArticle = "aeiou".includes(status[0]) ? "an" : "a";
	return `🚧 \`${command}\` is ${indefiniteArticle} ${status} command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose`;
}
