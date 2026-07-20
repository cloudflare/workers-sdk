import { getBooleanEnvironmentVariableFactory } from "@cloudflare/workers-utils";
import { detectAgent } from "./utils/detect-agent";

/**
 * Reads the `WRANGLER_OUTPUTS_FOR_AGENTS` environment variable.
 *
 * - `true` — force AI-optimized (structured markdown) error output.
 * - `false` — force concise human error output, even inside an AI agent.
 * - `undefined` — fall back to automatic detection via `detectAgent()`.
 *
 * Not memoized, so changes at runtime (e.g. via `vi.stubEnv` in tests)
 * take effect immediately.
 */
const getOutputsForAgentsFromEnv = getBooleanEnvironmentVariableFactory({
	variableName: "WRANGLER_OUTPUTS_FOR_AGENTS",
});

/**
 * Determines whether CLI error output should use AI-optimized messages.
 *
 * The resolution order is:
 *
 * 1. **`WRANGLER_OUTPUTS_FOR_AGENTS` env var** — checked on every call (no
 *    caching). Set to `"true"` to force AI output; set to `"false"` to
 *    force human output, even when an AI agent is driving the process.
 * 2. **`detectAgent()` detection** — falls back to the canonical agentic
 *    environment detection wrapper (which uses `am-i-vibing` internally
 *    with `processAncestry: []` to skip slow process tree checks). Only
 *    pure `"agent"` environments return `true`; hybrid terminals like
 *    VS Code and Warp are intentionally excluded. The result is cached for
 *    the lifetime of the process so the detection runs at most once.
 *
 * The detection cache is encapsulated in a closure to avoid a bare
 * module-level mutable variable.
 *
 * @returns `true` when AI-optimized output should be used.
 */
export const isAgenticEnvironment: () => boolean = (() => {
	let cachedResult: boolean | null = null;

	return () => {
		// The override env var is read on every call (the factory is not
		// memoized) so it can be toggled at runtime — e.g. via `vi.stubEnv`
		// in tests — without needing a cache reset.
		const override = getOutputsForAgentsFromEnv();
		if (override !== undefined) {
			return override;
		}

		if (cachedResult !== null) {
			return cachedResult;
		}

		cachedResult = detectAgent().isAgent;
		return cachedResult;
	};
})();
