import { CI } from "./is-ci";

/**
 * Test whether the process is "interactive".
 * Reasons it may not be interactive: it could be running in CI,
 * or you're piping values from / to another process, etc
 */
export default function isInteractive(): boolean {
	if (process.env.CF_PAGES === "1" || process.env.WORKERS_CI === "1") {
		return false;
	}

	try {
		return Boolean(process.stdin.isTTY && process.stdout.isTTY);
	} catch {
		return false;
	}
}

// TODO: Use this function across the codebase.
export function isNonInteractiveOrCI(): boolean {
	return !isInteractive() || CI.isCI();
}
