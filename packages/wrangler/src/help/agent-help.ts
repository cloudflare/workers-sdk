import { getEnvironmentVariableFactory } from "@cloudflare/workers-utils";
import { detectAgenticEnvironment } from "am-i-vibing";
import type {
	DefinitionTreeNode,
	InternalDefinition,
	Metadata,
} from "../core/types";

/**
 * Minimal structural view of a yargs argument/flag definition.
 *
 * Both command `args` (`ArgDefinition`) and the parser's global
 * flags are read through this shape so the renderer can treat
 * them uniformly.
 */
interface RenderableArg {
	alias?: string | readonly string[];
	array?: boolean;
	choices?: readonly (string | number | boolean)[];
	default?: unknown;
	demandOption?: boolean;
	deprecated?: boolean | string;
	describe?: string;
	hidden?: boolean;
	type?: string;
}

type RenderableArgs = Record<string, RenderableArg>;

const HELP_FORMAT_CHOICES = ["agent", "human"] as const satisfies string[];

const getHelpFormatFromEnv = getEnvironmentVariableFactory({
	choices: HELP_FORMAT_CHOICES,
	variableName: "WRANGLER_HELP_FORMAT",
});

/**
 * Decide whether `--help` should render the agent-friendly Markdown output.
 *
 * `WRANGLER_HELP_FORMAT` takes precedence (`agent` forces it on, `human` forces
 * it off). Otherwise we auto-detect via `am-i-vibing` and opt in for autonomous
 * `agent` and `hybrid` environments, leaving `interactive` (human-in-the-loop)
 * tools on the standard pretty output.
 *
 * Detection is environment-variable only (empty process ancestry) to match the
 * metrics dispatcher and avoid the slow process-tree walk.
 */
export function shouldUseAgentHelp(): boolean {
	let override: (typeof HELP_FORMAT_CHOICES)[number] | undefined;
	try {
		override = getHelpFormatFromEnv();
	} catch {
		// Invalid value: ignore the override and fall back to auto-detection.
	}

	if (override === "agent") {
		return true;
	}
	if (override === "human") {
		return false;
	}

	try {
		// TODO(@nurodev): Remove `detectAgenticEnvironment` use as it's deprecated
		const { type } = detectAgenticEnvironment(process.env, []);
		return type === "agent" || type === "hybrid";
	} catch {
		// Silent failure: default to the standard human output.
		return false;
	}
}

interface ResolvedCommand {
	node: DefinitionTreeNode;
	/** Canonical command segments consumed from the input (excludes `wrangler`). */
	path: string[];
}

/**
 * Resolve a command path against the registry tree, consuming segments only
 * while each one matches a child node. Resolution stops at the first segment
 * that is not a known subcommand, so trailing positional values (e.g. the
 * `mykey` in `wrangler kv key get mykey --help`) are ignored. Alias nodes are
 * followed to their target command.
 */
export function resolveCommandNode(
	root: DefinitionTreeNode,
	segments: string[]
): ResolvedCommand {
	let node = root;

	const path: string[] = [];
	for (const segment of segments) {
		const child = node.subtree.get(segment);
		if (!child) {
			break;
		}

		node = child;
		path.push(segment);
	}

	return followAlias(root, {
		node,
		path,
	});
}

function followAlias(
	root: DefinitionTreeNode,
	resolved: ResolvedCommand,
	seen = new Set<string>()
): ResolvedCommand {
	const definition = resolved.node.definition;
	if (definition?.type !== "alias") {
		return resolved;
	}

	if (seen.has(definition.command)) {
		return resolved;
	}
	seen.add(definition.command);

	const targetSegments = commandToSegments(definition.aliasOf);
	let node = root;
	const path: string[] = [];
	for (const segment of targetSegments) {
		const child = node.subtree.get(segment);
		if (!child) {
			// Target no longer resolvable: fall back to the alias node itself.
			return resolved;
		}
		node = child;
		path.push(segment);
	}

	return followAlias(
		root,
		{
			node,
			path,
		},
		seen
	);
}

function commandToSegments(command: string): string[] {
	return command
		.replace(/^wrangler\s+/, "")
		.split(/\s+/)
		.filter(Boolean);
}

/**
 * Render the agent-friendly Markdown help for a resolved command.
 *
 * - The root (`wrangler --help`) is rendered shallow: top-level commands grouped
 *   by category, each with its immediate children, then the global flags.
 * - A named command/namespace renders its entire subtree recursively, so a
 *   single `--help` call returns every descendant with its args, positionals,
 *   and examples.
 */
export function renderAgentHelp(options: {
	command: ResolvedCommand;
	globalFlags: RenderableArgs;
	orderedCategories: Map<string, string[]>;
	root: DefinitionTreeNode;
}): string {
	const { command, globalFlags, orderedCategories, root } = options;
	if (command.path.length === 0) {
		return renderRoot({
			root,
			globalFlags,
			orderedCategories,
		});
	}

	const lines: string[] = [];
	renderCommandSection(command.node, command.path, 1, lines);

	const hideGlobalFlags = new Set(
		command.node.definition?.metadata?.hideGlobalFlags ?? []
	);
	appendGlobalFlags(lines, globalFlags, hideGlobalFlags);

	return lines.join("\n").trimEnd();
}

function renderRoot(options: {
	globalFlags: RenderableArgs;
	orderedCategories: Map<string, string[]>;
	root: DefinitionTreeNode;
}): string {
	const { root, globalFlags, orderedCategories } = options;
	const lines: string[] = ["# wrangler", ""];

	const categorized = new Set<string>();
	for (const commands of orderedCategories.values()) {
		for (const name of commands) {
			categorized.add(name);
		}
	}

	const uncategorized = [...root.subtree.keys()]
		.filter((name) => !categorized.has(name))
		.filter((name) => !isHiddenFromListing(root.subtree.get(name)))
		.sort();

	if (uncategorized.length > 0) {
		lines.push("## Commands", "");
		for (const name of uncategorized) {
			appendRootCommand(lines, root, [name]);
		}
		lines.push("");
	}

	for (const [category, commands] of orderedCategories) {
		const visible = commands.filter(
			(name) => !isHiddenFromListing(root.subtree.get(name))
		);
		if (visible.length === 0) {
			continue;
		}

		lines.push(`## ${category}`, "");
		for (const name of visible) {
			appendRootCommand(lines, root, [name]);
		}
		lines.push("");
	}

	appendGlobalFlags(lines, globalFlags, new Set());

	return lines.join("\n").trimEnd();
}

function appendRootCommand(
	lines: string[],
	root: DefinitionTreeNode,
	path: string[]
): void {
	const node = root.subtree.get(path[0]);
	if (!node || isHiddenFromListing(node)) {
		return;
	}

	lines.push(commandListItem(node.definition, path, 0));

	const children = [...node.subtree.entries()]
		.filter(([, child]) => !isHiddenFromListing(child))
		.sort(([a], [b]) => a.localeCompare(b));

	for (const [name, child] of children) {
		lines.push(commandListItem(child.definition, [...path, name], 1));
	}
}

function commandListItem(
	definition: InternalDefinition | undefined,
	path: string[],
	indentLevel: number
): string {
	const indent = "  ".repeat(indentLevel);
	const description = definition?.metadata?.description ?? "";
	const status = statusSuffix(definition?.metadata);
	const summary = [description, status].filter(Boolean).join(" ");
	const command = `\`wrangler ${path.join(" ")}\``;
	return summary
		? `${indent}- ${command} — ${summary}`
		: `${indent}- ${command}`;
}

/**
 * Recursively render a command/namespace and all of its visible descendants.
 * Headings deepen with the tree but are clamped at level 6 (Markdown's max).
 */
function renderCommandSection(
	node: DefinitionTreeNode,
	path: string[],
	depth: number,
	lines: string[]
): void {
	const heading = "#".repeat(Math.min(depth, 6));
	const status = statusSuffix(node.definition?.metadata);
	lines.push(
		`${heading} wrangler ${path.join(" ")}${status ? ` ${status}` : ""}`
	);

	const description = node.definition?.metadata?.description;
	if (description) {
		lines.push("", description);
	}

	if (node.definition?.type === "command") {
		appendCommandBody(lines, node.definition, path);
	}

	const children = [...node.subtree.entries()]
		.filter(([, child]) => !isHiddenFromListing(child))
		.sort(([a], [b]) => a.localeCompare(b));
	for (const [name, child] of children) {
		lines.push("");
		renderCommandSection(child, [...path, name], depth + 1, lines);
	}
}

function appendCommandBody(
	lines: string[],
	definition: Extract<InternalDefinition, { type: "command" }>,
	path: string[]
): void {
	const args = (definition.args ?? {}) as RenderableArgs;
	const positionalKeys = definition.positionalArgs ?? [];
	const positionalSet = new Set<string>(positionalKeys);

	lines.push("", "**Usage**", "");
	lines.push("```");
	lines.push(synthesizeUsage(path, positionalKeys, args));
	lines.push("```");

	const visiblePositionals = positionalKeys.filter((key) => !args[key]?.hidden);
	if (visiblePositionals.length > 0) {
		lines.push("", "**Positionals**", "");
		for (const key of visiblePositionals) {
			lines.push(formatPositional(key, args[key]));
		}
	}

	const optionEntries = Object.entries(args).filter(
		([key, arg]) => !positionalSet.has(key) && !arg.hidden
	);
	if (optionEntries.length > 0) {
		lines.push("", "**Options**", "");
		for (const [key, arg] of optionEntries) {
			lines.push(formatFlag(key, arg));
		}
	}

	const examples = definition.metadata?.examples ?? [];
	if (examples.length > 0) {
		lines.push("", "**Examples**", "");
		for (const example of examples) {
			lines.push(`- ${example.description}`);
			lines.push("  ```");
			lines.push(`  ${example.command}`);
			lines.push("  ```");
		}
	}

	const epilogue = definition.metadata?.epilogue;
	if (epilogue) {
		lines.push("", epilogue);
	}
}

function appendGlobalFlags(
	lines: string[],
	globalFlags: RenderableArgs,
	hide: Set<string>
): void {
	const entries = Object.entries(globalFlags).filter(
		([key, flag]) => !flag.hidden && !hide.has(key)
	);
	if (entries.length === 0) {
		return;
	}

	lines.push("", "**Global flags**", "");
	for (const [key, flag] of entries) {
		lines.push(formatFlag(key, flag));
	}
}

function synthesizeUsage(
	path: string[],
	positionalKeys: string[],
	args: RenderableArgs
): string {
	const parts = [`wrangler ${path.join(" ")}`];
	for (const key of positionalKeys) {
		const arg = args[key];
		if (arg?.hidden) {
			continue;
		}
		const name = arg?.array ? `${key}...` : key;
		parts.push(arg?.demandOption ? `<${name}>` : `[${name}]`);
	}

	parts.push("[options]");

	return parts.join(" ");
}

function formatPositional(key: string, arg: RenderableArg | undefined): string {
	const attributes = [
		arg?.type ?? "string",
		arg?.demandOption ? "required" : "optional",
	];
	if (arg?.array) {
		attributes.push("variadic");
	}

	const describe = arg?.describe ? ` — ${arg.describe}` : "";
	const choices = formatChoices(arg);

	return `- \`<${key}>\` (${attributes.join(", ")})${describe}${choices}`;
}

function formatFlag(name: string, arg: RenderableArg): string {
	const flag = `\`${formatFlagNames(name, arg)}\``;

	const details: string[] = [];
	if (arg.demandOption) {
		details.push("required");
	}
	if (arg.default !== undefined && arg.default !== false) {
		details.push(`default: ${JSON.stringify(arg.default)}`);
	}

	const meta = details.length > 0 ? ` [${details.join(", ")}]` : "";
	const describe = arg.describe ? ` — ${arg.describe}` : "";
	const choices = formatChoices(arg);

	return `- ${flag}${describe}${choices}${meta}`;
}

/**
 * Build the displayed flag token, e.g. `-c, --config <string>`.
 *
 * Single-character names/aliases become short flags (`-c`); longer
 * ones become long flags (`--config`). A value placeholder is appended
 * for non-boolean flags.
 */
function formatFlagNames(name: string, arg: RenderableArg): string {
	const names = [name, ...toArray(arg.alias)];
	const tokens = names
		.map((flagName) =>
			flagName.length === 1 ? `-${flagName}` : `--${flagName}`
		)
		// Short flags (single dash) first, then long flags.
		.sort((a, b) => a.replace(/^-+/, "").length - b.replace(/^-+/, "").length);

	const placeholder = flagPlaceholder(arg);
	return placeholder
		? `${tokens.join(", ")} ${placeholder}`
		: tokens.join(", ");
}

function flagPlaceholder(arg: RenderableArg): string {
	if (arg.type === "boolean") {
		return "";
	}
	if (arg.choices && arg.choices.length > 0) {
		return `<${arg.choices.join("|")}>`;
	}
	const base = arg.type ?? "string";
	return arg.array ? `<${base}...>` : `<${base}>`;
}

function formatChoices(arg: RenderableArg | undefined): string {
	if (!arg?.choices || arg.choices.length === 0) {
		return "";
	}
	// Boolean placeholders already encode their choices.
	if (arg.type === "boolean") {
		return "";
	}
	return ` (choices: ${arg.choices.join(", ")})`;
}

const STATUS_LABELS = {
	alpha: "[alpha]",
	experimental: "[experimental]",
	"open beta": "[open beta]",
	"private beta": "[private beta]",
} as const satisfies Partial<Record<Metadata["status"], string>>;

function statusSuffix(
	metadata: Metadata | Partial<Metadata> | undefined
): string {
	const status = metadata?.status;
	if (!status || status === "stable" || metadata?.hidden) {
		return "";
	}

	return STATUS_LABELS[status] ?? "";
}

/**
 * Whether a node should be omitted when listing commands.
 *
 * Hidden commands are skipped, as are alias nodes: aliases are still
 * resolvable as `--help` targets (via `resolveCommandNode`) but are not
 * listed as separate commands, matching the standard help output.
 */
function isHiddenFromListing(node: DefinitionTreeNode | undefined): boolean {
	const definition = node?.definition;
	return Boolean(definition?.metadata?.hidden) || definition?.type === "alias";
}

function toArray(value: string | readonly string[] | undefined): string[] {
	if (value === undefined) {
		return [];
	}

	return Array.isArray(value) ? [...value] : [value as string];
}
