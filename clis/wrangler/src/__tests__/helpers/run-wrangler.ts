import { main } from "../../index";
import * as shellquote from "../../utils/shell-quote";
import { normalizeSlashes, stripTimings } from "./mock-console";

/**
 * A helper to 'run' wrangler commands for tests.
 */
export async function runWrangler(
	cmd = "",
	env: Record<string, string | undefined> = {}
) {
	const originalEnv = process.env;
	try {
		process.env = { ...originalEnv, ...env };
		const argv = shellquote.parse(cmd);
		await main(argv);
	} catch (err) {
		if (err instanceof Error) {
			err.message = normalizeSlashes(stripTimings(err.message));
		}
		throw err;
	} finally {
		process.env = originalEnv;
	}
}
