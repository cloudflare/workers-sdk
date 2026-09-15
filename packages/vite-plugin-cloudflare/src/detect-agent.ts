// eslint-disable-next-line no-restricted-imports -- This is the canonical wrapper around am-i-vibing; all other code should use isAgentSession() from this module
import { detectAgenticEnvironment } from "am-i-vibing";

// Process tree traversal shells out to `ps`, which is slow (~75ms) and can time
// out in CI. Environment variables are enough to identify agentic environments.
// Passing an empty array keeps that off regardless of the library's default.
const NO_PROCESS_ANCESTRY: { command?: string }[] = [];

/**
 * Detects whether the current process is being driven by an AI coding agent.
 *
 * True only when the detected type is exactly `"agent"`. Hybrid terminals (Warp,
 * VS Code) embed agentic features but still have a human at the keyboard, so
 * they're treated as interactive — note `isAgent()` from the library would
 * report them as agents.
 *
 * Any error resolves to `false` rather than propagating.
 */
export function isAgentSession(): boolean {
	try {
		return (
			detectAgenticEnvironment({
				env: process.env,
				processAncestry: NO_PROCESS_ANCESTRY,
			}).type === "agent"
		);
	} catch {
		return false;
	}
}
