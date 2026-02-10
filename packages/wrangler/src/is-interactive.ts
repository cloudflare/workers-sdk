import { isInteractive as __isInteractive } from "@cloudflare/cli/interactive";
import ci from "ci-info";

/**
 * Returns whether the process can prompt the user for input.
 *
 * A process is considered interactive when **both** conditions are met:
 * - It is **not** running in a CI environment.
 * - `stdin` and `stdout` are connected to a TTY (not piped from/to another process).
 *
 * @returns `true` if the process is interactive, `false` otherwise.
 */
export default function isInteractive(): boolean {
	return !ci.isCI && __isInteractive();
}

/**
 * Returns whether the process should not prompt the user.
 *
 * This is the logical negation of {@link isInteractive}: it returns `true`
 * when the process is running in CI or when the terminal is not a TTY.
 *
 * @returns `true` if the process is non-interactive or running in CI.
 */
export function isNonInteractiveOrCI(): boolean {
	return !isInteractive();
}
