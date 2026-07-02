import { detectAgenticEnvironment } from "am-i-vibing";
import dedent from "ts-dedent";
import { logger } from "./logger";

/**
 * Log a tip suggesting `wrangler list-commands` after an unknown command error.
 *
 * When an AI agent is detected (via `am-i-vibing`), shows a detailed message
 * with flag descriptions and usage examples to help the agent self-correct.
 * Otherwise, shows a short one-line tip for human users.
 */
export function logUnknownCommandTip(): void {
	let isAgentic = false;
	try {
		isAgentic = detectAgenticEnvironment().isAgentic;
	} catch {
		// Silent failure — agent detection is best-effort
	}

	if (isAgentic) {
		logger.log(dedent`
			\n${"-".repeat(10)}\n

			Tip: Use \`wrangler list-commands\` to explore all available commands and subcommands.

			By default, only top-level commands are shown. Use these flags to dig deeper:
			  --all              Show the full command tree (all nesting levels)
			  --base="<cmd>"     Scope to a specific command subtree
			  --json             Output as JSON

			Examples:
			  wrangler list-commands                          List all top-level commands
			  wrangler list-commands --base="d1"              Show d1 subcommands
			  wrangler list-commands --base="kv"              Show kv subcommands
			  wrangler list-commands --base="ai-search jobs"  Show ai-search jobs subcommands
			  wrangler list-commands --all                    Show entire command tree (token-intensive)
			  wrangler list-commands --json                   Machine-readable output
		`);
	} else {
		logger.log(
			"\n☝️ Tip: Run `wrangler list-commands` to see all available commands and subcommands."
		);
	}
	logger.log("\n");
}
