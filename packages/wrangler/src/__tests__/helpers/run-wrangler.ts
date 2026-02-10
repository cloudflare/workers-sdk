import { normalizeString } from "@cloudflare/workers-utils/test-helpers";
import { vi } from "vitest";
import { main } from "../../index";
import * as shellquote from "../../utils/shell-quote";

/**
 * A helper to 'run' wrangler commands for tests.
 */
export async function runWrangler(
	cmd = "",
	env: Record<string, string | undefined> = {}
) {
	for (const [key, value] of Object.entries(env)) {
		vi.stubEnv(key, value);
	}
	try {
		const argv = shellquote.parse(cmd);
		await main(argv);
	} catch (err) {
		if (err instanceof Error) {
			err.message = normalizeString(err.message);
		}
		throw err;
	}
}
