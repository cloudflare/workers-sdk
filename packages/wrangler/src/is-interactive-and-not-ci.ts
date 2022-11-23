import { CI } from "./is-ci";

/**
 * Test whether the process is "interactive" and not running in CI.
 */
export default function isInteractiveAndNotCI(): boolean {
	if (process.env.CF_PAGES === "1") {
		return false;
	}

	try {
		return Boolean(process.stdin.isTTY && process.stdout.isTTY && !CI.isCI());
	} catch {
		return false;
	}
}
