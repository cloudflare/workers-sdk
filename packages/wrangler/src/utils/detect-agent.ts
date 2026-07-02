import { detectAgenticEnvironment } from "am-i-vibing";

// Pass an empty array for processAncestry to skip process tree checks entirely.
// Process tree traversal uses execSync('ps ...') which is slow and can cause
// timeouts, especially in CI environments. Environment variable detection
// is sufficient for identifying most agentic environments.
const NO_PROCESS_ANCESTRY: { command?: string }[] = [];

/**
 * Detects whether Wrangler is currently being run by an AI coding agent.
 *
 * This is intentionally strict: it only returns `true` when the detected
 * environment type is exactly `"agent"`, NOT `"hybrid"` or `"interactive"`.
 * Hybrid terminals (such as Warp or VS Code) embed agentic features but are
 * still driven by a human at the keyboard, so they should behave like a human.
 *
 * Mirrors the silent-failure pattern in metrics-dispatcher.ts: any error
 * results in `false` rather than propagating.
 */
export function isAgenticAgent(): boolean {
	try {
		return (
			detectAgenticEnvironment(process.env, NO_PROCESS_ANCESTRY).type ===
			"agent"
		);
	} catch {
		// Silent failure - assume we are not being run by an agent.
		return false;
	}
}

/**
 * Returns the detected agentic environment id (e.g. the agent's identifier),
 * or `null` when nothing is detected or detection fails. Intended for telemetry.
 */
export function getDetectedAgentId(): string | null {
	try {
		return detectAgenticEnvironment(process.env, NO_PROCESS_ANCESTRY).id;
	} catch {
		// Silent failure - no id available.
		return null;
	}
}
