import { getBooleanEnvironmentVariableFactory } from "@cloudflare/workers-utils";
import { detectAgenticEnvironment } from "am-i-vibing";

/**
 * Reads the `WRANGLER_OUTPUTS_FOR_AGENTS` environment variable.
 *
 * - `true` — force AI-optimized (structured markdown) error output.
 * - `false` — force concise human error output, even inside an AI agent.
 * - `undefined` — fall back to automatic detection via `am-i-vibing`.
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
 * 2. **`am-i-vibing` detection** — falls back to automatic agentic
 *    environment detection via `detectAgenticEnvironment()`. The result is
 *    cached for the lifetime of the process so the (potentially expensive)
 *    detection runs at most once.
 *
 * The `am-i-vibing` cache is encapsulated in a closure to avoid a bare
 * module-level mutable variable.
 *
 * @returns `true` when AI-optimized output should be used.
 */
export const isAgenticEnvironment: () => boolean = (() => {
	let cachedAmIVibingResult: boolean | null = null;

	return () => {
		// The override env var is read on every call (the factory is not
		// memoized) so it can be toggled at runtime — e.g. via `vi.stubEnv`
		// in tests — without needing a cache reset.
		const override = getOutputsForAgentsFromEnv();
		if (override !== undefined) {
			return override;
		}

		if (cachedAmIVibingResult !== null) {
			return cachedAmIVibingResult;
		}
		try {
			const detection = detectAgenticEnvironment({ env: process.env });
			cachedAmIVibingResult = detection.isAgentic;
		} catch {
			cachedAmIVibingResult = false;
		}
		return cachedAmIVibingResult;
	};
})();
