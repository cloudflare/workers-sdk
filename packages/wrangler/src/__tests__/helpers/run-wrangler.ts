import shellquote from "shell-quote";
import { main } from "../../index";
import { normalizeSlashes, stripTimings } from "./mock-console";

/**
 * A helper to 'run' wrangler commands for tests.
 */
export async function runWrangler(cmd = "") {
	try {
		const argv = shellquote.parse(cmd) as string[];
		await main(argv);
	} catch (err) {
		if (err instanceof Error) {
			err.message = normalizeSlashes(stripTimings(err.message));
		}
		throw err;
	}
}
