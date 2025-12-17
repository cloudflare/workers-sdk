import { globalFlags } from "../global-flags";
import { logger } from "../logger";
import { getDefinitionTree } from "./registry-store";
import type { DefinitionTree, NamedArgDefinitions } from "../core/types";

interface CompletionResult {
	value: string;
	description: string;
}

/**
 * Handle __complete command - outputs tab-separated completions to stdout.
 * Called by shell completion scripts at runtime.
 *
 * @param args - Command line words (e.g., ["wrangler", "kv", "na"])
 */
export function handleComplete(args: string[]): void {
	// args[0] = "wrangler", args[1..n] = subcommands/partial input
	const words = args.slice(1); // Remove "wrangler"
	const current = words[words.length - 1] || ""; // Word being completed

	// Build command path, skipping flags and their values
	const commandPath: string[] = [];
	const completedWords = words.slice(0, -1);
	for (let i = 0; i < completedWords.length; i++) {
		const word = completedWords[i];
		if (word.startsWith("-")) {
			// Skip flag and potentially its value (next word if not a flag)
			const nextWord = completedWords[i + 1];
			if (nextWord && !nextWord.startsWith("-")) {
				i++; // Skip the flag's value
			}
		} else {
			commandPath.push(word);
		}
	}

	const tree = getDefinitionTree();
	const completions = getCompletions(tree, commandPath, current);

	for (const c of completions) {
		// Tab-separated format: "value\tdescription"
		// Shell parses this natively - no escaping needed
		logger.log(`${c.value}\t${c.description}`);
	}
}

function getCompletions(
	tree: DefinitionTree,
	commandPath: string[],
	prefix: string
): CompletionResult[] {
	const results: CompletionResult[] = [];

	// Navigate to current position in command tree
	let node = tree;
	for (const segment of commandPath) {
		const child = node.get(segment);
		if (!child) {
			return results; // Invalid path
		}
		node = child.subtree;
	}

	// If prefix starts with "-", complete flags
	if (prefix.startsWith("-")) {
		results.push(...getFlagCompletions(tree, commandPath, prefix));
	} else {
		// Complete subcommands
		for (const [name, child] of node.entries()) {
			const def = child.definition;
			if (!def || def.metadata?.hidden || def.type === "alias") {
				continue;
			}

			if (name.startsWith(prefix)) {
				results.push({
					value: name,
					description: sanitizeDescription(def.metadata?.description ?? ""),
				});
			}
		}
	}

	// Add flag completions if not already completing a flag
	if (!prefix.startsWith("-")) {
		results.push(...getFlagCompletions(tree, commandPath, ""));
	}

	return results;
}

function getFlagCompletions(
	tree: DefinitionTree,
	commandPath: string[],
	prefix: string
): CompletionResult[] {
	const results: CompletionResult[] = [];

	// Get command-specific flags
	const cmdFlags = getCommandFlags(tree, commandPath);
	for (const flag of cmdFlags) {
		const longFlag = `--${flag.name}`;
		if (longFlag.startsWith(prefix)) {
			results.push({
				value: longFlag,
				description: sanitizeDescription(flag.description),
			});
		}
	}

	// Add global flags
	for (const name of Object.keys(globalFlags)) {
		const def = globalFlags[name as keyof typeof globalFlags];

		// Skip hidden flags
		if ("hidden" in def && def.hidden) {
			continue;
		}

		const longFlag = `--${name}`;
		if (longFlag.startsWith(prefix)) {
			results.push({
				value: longFlag,
				description: sanitizeDescription(def.describe ?? ""),
			});
		}
	}

	// Add --help which is provided by yargs
	if ("--help".startsWith(prefix)) {
		results.push({
			value: "--help",
			description: "Show help",
		});
	}

	return results;
}

interface FlagMeta {
	name: string;
	description: string;
}

function getCommandFlags(
	tree: DefinitionTree,
	commandPath: string[]
): FlagMeta[] {
	const flags: FlagMeta[] = [];

	// Navigate to the command
	let node = tree;
	let def = null;
	for (const segment of commandPath) {
		const child = node.get(segment);
		if (!child) {
			return flags;
		}
		def = child.definition;
		node = child.subtree;
	}

	if (!def || def.type !== "command") {
		return flags;
	}

	const args: NamedArgDefinitions = def.args ?? {};

	for (const name of Object.keys(args)) {
		const arg = args[name];
		if (!arg || arg.hidden) {
			continue;
		}

		const description =
			typeof arg.describe === "string"
				? arg.describe
				: typeof arg.description === "string"
					? arg.description
					: "";

		flags.push({
			name,
			description,
		});
	}

	return flags;
}

/**
 * Sanitize description - remove special chars that could break output
 */
function sanitizeDescription(desc: string): string {
	return (
		desc
			// Remove ANSI color codes
			// eslint-disable-next-line no-control-regex
			.replace(/\x1b\[[0-9;]*m/g, "")
			// Remove status badges
			.replace(/\s*\[(?:experimental|alpha|private-beta|open-beta)\]/gi, "")
			// Remove default values and deprecated
			.replace(/\s*\[default:[^\]]*\]/gi, "")
			.replace(/\s*\[deprecated\]/gi, "")
			// Remove parenthetical asides
			.replace(/\s*\([^)]*\)/g, "")
			// Remove tabs (our delimiter)
			.replace(/\t/g, " ")
			// Remove newlines
			.replace(/\n/g, " ")
			.trim()
			// Limit to 80 chars to prevent terminal overflow
			.slice(0, 80)
	);
}
