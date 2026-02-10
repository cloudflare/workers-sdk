import { isInteractive as __isInteractive } from "@cloudflare/cli/interactive";
import ci from "ci-info";

/**
 * Returns whether the process can handle interactive input (e.g. hotkeys).
 *
 * A process is considered interactive when **both** conditions are met:
 * - It is **not** running in a Cloudflare CI environment (Pages or Workers CI).
 * - `stdin` and `stdout` are connected to a TTY (not piped from/to another process).
 *
 * Note: generic CI environments (e.g. GitHub Actions) do **not** disable interactivity,
 * because a real PTY may still be attached and hotkeys should still work.
 *
 * Use this for features that require a TTY but should remain functional in generic CI:
 * - Registering hotkeys (e.g. `x` to exit `wrangler dev`)
 * - Enabling raw mode / keypress handling
 * - Showing animated spinners or progress indicators
 * - Reading secrets from an interactive prompt vs stdin
 *
 * Use {@link isNonInteractiveOrCI} instead when user input should be suppressed
 * in **all** CI environments.
 *
 * @returns `true` if the process is interactive, `false` otherwise.
 */
export default function isInteractive(): boolean {
	// Only Cloudflare-specific CI environments force non-interactive mode.
	// Generic CI (e.g. GitHub Actions) is intentionally excluded here because
	// tools like `node-pty` can attach a real PTY in CI, and features like
	// hotkeys (e.g. 'x' to exit `wrangler dev`) should still work in that case.
	// For suppressing user prompts in all CI environments, use isNonInteractiveOrCI().
	if (ci.CLOUDFLARE_PAGES || ci.CLOUDFLARE_WORKERS) {
		return false;
	}

	return __isInteractive();
}

/**
 * Returns whether the process should not prompt the user.
 *
 * Returns `true` when the process is non-interactive (no TTY) **or** running
 * in any CI environment (detected via `ci-info`). This is stricter than
 * {@link isInteractive} which only checks for Cloudflare-specific CI,
 * because user prompts should never appear in CI even when a PTY is attached.
 *
 * Use this for anything that should be suppressed or adapted in CI:
 * - User prompts (confirmations, text input, select dialogs)
 * - OAuth login flows
 * - Output format decisions (JSON in CI, pretty when interactive)
 * - Banner / decoration display
 * - Redacting sensitive info (account names, emails) in CI logs
 * - Writing config changes back to disk (e.g. provisioned resource IDs)
 *
 * @returns `true` if the process is non-interactive or running in CI.
 */
export function isNonInteractiveOrCI(): boolean {
	return !isInteractive() || ci.isCI;
}
