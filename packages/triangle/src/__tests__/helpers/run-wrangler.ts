import { main } from "../../index";
import { normalizeSlashes, stripTimings } from "./mock-console";

/**
 * A helper to 'run' triangle commands for tests.
 */
export async function runTriangle(cmd?: string) {
	try {
		await main(cmd?.split(" ") ?? []);
	} catch (err) {
		if (err instanceof Error) {
			err.message = normalizeSlashes(stripTimings(err.message));
		}
		throw err;
	}
}
