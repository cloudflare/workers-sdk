import { detectAgenticEnvironment } from "am-i-vibing";

// Pass an empty array for processAncestry to skip process tree checks entirely.
// Process tree traversal uses execSync('ps ...') which is slow and can cause
// timeouts, especially in CI environments. Environment variable detection
// is sufficient for identifying most agentic environments.
const NO_PROCESS_ANCESTRY: { command?: string }[] = [];

/** The result of a single agentic-environment detection pass. */
export interface DetectedAgent {
	/**
	 * True only when the detected environment type is exactly `"agent"`, NOT
	 * `"hybrid"` or `"interactive"`. Hybrid terminals (such as Warp or VS Code)
	 * embed agentic features but are still driven by a human at the keyboard, so
	 * they should behave like a human.
	 */
	isAgent: boolean;
	/**
	 * The detected agent's identifier, or `null` when nothing is detected or
	 * detection fails. Intended for telemetry.
	 */
	id: string | null;
}

/**
 * Detects whether Wrangler is currently being run by an AI coding agent,
 * returning both whether it is a pure agent and the detected agent id in a
 * single pass. Callers that need both (e.g. the Pages-to-Workers delegation,
 * which gates on `isAgent` and records `id` in telemetry) should use this
 * rather than detecting twice.
 *
 * Mirrors the silent-failure pattern in metrics-dispatcher.ts: any error
 * resolves to a non-agent result rather than propagating.
 */
export function detectAgent(): DetectedAgent {
	try {
		const detection = detectAgenticEnvironment(
			process.env,
			NO_PROCESS_ANCESTRY
		);
		return { isAgent: detection.type === "agent", id: detection.id };
	} catch {
		// Silent failure - assume we are not being run by an agent.
		return { isAgent: false, id: null };
	}
}
