// eslint-disable-next-line no-restricted-imports -- This is the canonical wrapper around am-i-vibing; all other code should use isAgentSession() from this module
import { isAgent } from "am-i-vibing";

/**
 * Detects whether the current process is being driven by an AI coding agent.
 *
 * Returns `true` only when the detected environment type is exactly `"agent"`,
 * NOT `"hybrid"` or `"interactive"`. Hybrid terminals (such as Warp or VS Code)
 * embed agentic features but are still driven by a human at the keyboard, so
 * they should behave like a regular interactive session.
 *
 * Any error resolves to `false` rather than propagating.
 *
 * @returns Whether the session is driven by a headless AI agent
 */
export function isAgentSession(): boolean {
	try {
		return isAgent({ env: process.env });
	} catch {
		return false;
	}
}
