import { isInteractive as __isInteractive } from "@cloudflare/cli/interactive";
import { CI, isPagesCI, isWorkersCI } from "./is-ci";
import { TURBOREPO } from "./is-turborepo";

/**
 * Test whether the process is "interactive".
 * Reasons it may not be interactive: it could be running in CI,
 * or you're piping values from / to another process, or running under Turborepo, etc
 */
export default function isInteractive(): boolean {
	if (isPagesCI() || isWorkersCI() || TURBOREPO.isTurborepo()) {
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
