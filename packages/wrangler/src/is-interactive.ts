import { isInteractive as __isInteractive } from "@cloudflare/cli/interactive";
import ci from "ci-info";

/**
 * Test whether the process is "interactive".
 * Reasons it may not be interactive: it could be running in CI,
 * or you're piping values from / to another process, etc
 */
export default function isInteractive(): boolean {
	return !ci.isCI && __isInteractive();
}

/**
 * Test whether a process is non-interactive or running in CI.
 */
export function isNonInteractiveOrCI(): boolean {
	return !isInteractive();
}
