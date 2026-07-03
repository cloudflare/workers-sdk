import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createAlias, createCommand } from "./core/create-command";
import { experimental_getWranglerCommands } from "./experimental-commands-api";
import { logger } from "./logger";
import { stripAnsi } from "./utils/box";
import type { DefinitionTreeNode, InternalDefinition } from "./core/types";

/**
 * Strip leading emoji characters and trailing status badges from a description.
 * Descriptions in the command tree may have:
 * - Leading emojis (e.g. "📚 Open Wrangler's docs")
 * - Trailing chalk-decorated status badges (e.g. " [open beta]")
 * - Alias suffixes (e.g. "\n\nAlias for ...")
 *
 * @param description - The raw description string (may contain ANSI codes)
 * @returns The cleaned description string
 */
function cleanDescription(description: string): string {
	// Strip ANSI escape codes first
	let cleaned = stripAnsi(description);

	// Remove trailing status badges like " [open beta]", " [experimental]", etc.
	cleaned = cleaned.replace(
		/\s*\[(experimental|alpha|private beta|open beta)\]\s*$/,
		""
	);

	// Remove alias suffixes
	cleaned = cleaned.replace(/\n\nAlias for ".*"\./, "");

	// Strip leading emoji characters and following whitespace
	cleaned = cleaned.replace(
		/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u,
		""
	);

	return cleaned.trim();
}

/**
 * Represents a single command entry in the tree output.
 */
interface CommandEntry {
	/** The command segment name (e.g. "list", "create") */
	command: string;
	/** The full command path (e.g. "wrangler d1 list") */
	fullCommand: string;
	/** The human-readable description */
	description: string;
	/** The maturity status of the command */
	status: string;
	/** Whether this command is deprecated */
	deprecated: boolean;
	/** Whether this command is an alias for another command */
	aliasOf?: string;
	/** Whether this command has subcommands in the full tree (even if truncated) */
	hasSubcommands: boolean;
	/** Nested subcommands (may be empty when depth is truncated) */
	subcommands: CommandEntry[];
}

/**
 * Recursively walk the definition tree and build a structured list of command entries.
 * Skips hidden commands and optionally skips aliases.
 *
 * @param node - The current tree node to walk
 * @param parentPath - The command path segments leading to this node
 * @param includeAliases - Whether to include alias commands in the output
 * @returns An array of command entries
 */
function buildCommandTree(
	node: DefinitionTreeNode,
	parentPath: string[] = ["wrangler"],
	includeAliases: boolean = false
): CommandEntry[] {
	const entries: CommandEntry[] = [];

	const sortedChildren = [...node.subtree.entries()].sort(([a], [b]) =>
		a.localeCompare(b)
	);

	for (const [name, childNode] of sortedChildren) {
		const def = childNode.definition;

		// Skip nodes without definitions
		if (!def) {
			continue;
		}

		// Skip hidden commands
		if (def.metadata?.hidden) {
			continue;
		}

		// Skip aliases unless explicitly requested
		if (def.type === "alias" && !includeAliases) {
			continue;
		}

		const fullCommand = [...parentPath, name].join(" ");
		const description = def.metadata?.description
			? cleanDescription(def.metadata.description)
			: "";
		const status = getStatus(def);
		const deprecated = def.metadata?.deprecated === true;

		const subcommands = buildCommandTree(
			childNode,
			[...parentPath, name],
			includeAliases
		);

		const entry: CommandEntry = {
			command: name,
			fullCommand,
			description,
			status,
			deprecated,
			hasSubcommands: subcommands.length > 0,
			subcommands,
		};

		if (def.type === "alias") {
			entry.aliasOf = def.aliasOf;
		}

		entries.push(entry);
	}

	return entries;
}

/**
 * Truncate a command tree to a maximum depth, clearing subcommands beyond the limit.
 * The `hasSubcommands` field is preserved so callers can indicate truncation.
 *
 * @param entries - The command entries to truncate
 * @param maxDepth - The maximum number of nesting levels to keep (0 = no children, 1 = direct children only)
 * @returns A new array of command entries with subcommands cleared beyond maxDepth
 */
function truncateDepth(
	entries: CommandEntry[],
	maxDepth: number
): CommandEntry[] {
	if (maxDepth <= 0) {
		return entries.map((entry) => ({
			...entry,
			subcommands: [],
		}));
	}

	return entries.map((entry) => ({
		...entry,
		subcommands: truncateDepth(entry.subcommands, maxDepth - 1),
	}));
}

/**
 * Navigate the definition tree to a specific subtree node using path segments.
 * Throws a descriptive error if any segment in the path is not found.
 *
 * @param root - The root tree node to start navigation from
 * @param segments - The path segments to follow (e.g. ["ai-search", "jobs"])
 * @returns The tree node at the end of the path
 */
function navigateToBase(
	root: DefinitionTreeNode,
	segments: string[]
): DefinitionTreeNode {
	let node = root;
	const visited: string[] = [];

	for (const segment of segments) {
		const child = node.subtree.get(segment);
		if (!child) {
			const available = [...node.subtree.keys()]
				.filter((key) => {
					const def = node.subtree.get(key)?.definition;
					return def && !def.metadata?.hidden;
				})
				.sort()
				.join(", ");

			const pathSoFar = ["wrangler", ...visited].join(" ");
			throw new CommandLineArgsError(
				`Unknown command: "wrangler ${[...visited, segment].join(" ")}". ` +
					`Available commands under "${pathSoFar}": ${available}`,
				{ telemetryMessage: "list-commands unknown base path" }
			);
		}
		visited.push(segment);
		node = child;
	}

	return node;
}

/**
 * Get the status string from a command definition.
 *
 * @param def - The internal command/namespace/alias definition
 * @returns The status string (e.g. "stable", "open beta")
 */
function getStatus(def: InternalDefinition): string {
	if (def.type === "alias") {
		return "stable";
	}
	return def.metadata?.status ?? "stable";
}

/**
 * Render the command tree as a human-readable ASCII tree.
 * Uses box-drawing characters for the tree structure.
 *
 * @param entries - The command entries to render
 * @param prefix - The indentation prefix for the current level
 * @returns An array of formatted lines
 */
function renderTree(entries: CommandEntry[], prefix: string = ""): string[] {
	const lines: string[] = [];

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const isLast = i === entries.length - 1;
		const connector = isLast ? "└── " : "├── ";
		const childPrefix = isLast ? "    " : "│   ";

		let label = entry.command;

		// Add status/deprecated markers
		if (entry.deprecated) {
			label += " [deprecated]";
		} else if (entry.status !== "stable") {
			label += ` [${entry.status}]`;
		}

		// Add alias marker
		if (entry.aliasOf) {
			label += ` (alias of ${entry.aliasOf})`;
		}

		// Build the line with description
		let line = `${prefix}${connector}${label}`;
		if (entry.description) {
			// Pad to align descriptions
			const nameWidth = stripAnsi(line).length;
			const padding = Math.max(2, 40 - nameWidth);
			line += " ".repeat(padding) + entry.description;
		}

		// Add ellipsis when subcommands exist but are truncated
		if (entry.hasSubcommands && entry.subcommands.length === 0) {
			line += " ...";
		}

		lines.push(line);

		// Render subcommands
		if (entry.subcommands.length > 0) {
			lines.push(...renderTree(entry.subcommands, `${prefix}${childPrefix}`));
		}
	}

	return lines;
}

export const listCommandsCommand = createCommand({
	metadata: {
		description: "List all available commands and subcommands",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
	behaviour: {
		printBanner: (args) => !args.json,
		provideConfig: false,
		includePositionalArgsInMetrics: true,
	},
	args: {
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
		"include-aliases": {
			type: "boolean",
			default: false,
			description: "Include alias commands in the output",
		},
		all: {
			type: "boolean",
			default: false,
			description:
				"Show all subcommands at every depth. Warning: this can be very token-intensive at the top level when run by AI agents — consider scoping to a subtree instead (e.g. `wrangler list-commands d1`)",
		},
		base: {
			type: "string",
			array: true,
			description:
				'Show commands under a specific base command (e.g. "d1 migrations")',
		},
	},
	positionalArgs: ["base"],
	handler(args) {
		const { registry } = experimental_getWranglerCommands();

		// Navigate to the base node if positional segments are provided
		let rootNode = registry;
		const baseSegments = args.base ?? [];
		if (baseSegments.length > 0) {
			rootNode = navigateToBase(registry, baseSegments);
		}

		const basePath = ["wrangler", ...baseSegments];
		let tree = buildCommandTree(rootNode, basePath, args.includeAliases);

		// By default, show only the immediate commands (no nested subcommands).
		// With --all, show the full tree at every depth.
		if (!args.all) {
			tree = truncateDepth(tree, 0);
		}

		if (args.json) {
			logger.json({ commands: tree });
			return;
		}

		const lines = [basePath.join(" "), ...renderTree(tree)];
		logger.log(lines.join("\n"));
	},
});

export const listCmdsAlias = createAlias({
	aliasOf: "wrangler list-commands",
	metadata: {
		hidden: true,
	},
});
