import { isInteractive as __isInteractive } from "@cloudflare/cli/interactive";
import { getWranglerForceInteractiveFromEnv } from "../../workers-utils/src";
import { CI, isPagesCI, isWorkersCI } from "./is-ci";

/**
 * Test whether the process is "interactive".
 * Reasons it may not be interactive: it could be running in CI,
 * or you're piping values from / to another process, etc
 *
 * Can be forced to true by setting the WRANGLER_FORCE_INTERACTIVE environment
 * variable (useful for testing interactive features without a real TTY)
 */
export default function isInteractive(): boolean {
	// Allow forcing interactive mode for testing purposes
	if (getWranglerForceInteractiveFromEnv()) {
		return true;
	}

	if (isPagesCI() || isWorkersCI()) {
		return false;
	}

	return __isInteractive();
}

/**
 * Test whether a process is non-interactive or running in CI.
 */
export function isNonInteractiveOrCI(): boolean {
	return !isInteractive() || CI.isCI();
}
