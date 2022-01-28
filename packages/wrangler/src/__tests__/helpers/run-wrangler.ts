import { main } from "../../index";
import { normalizeSlashes, stripTimings } from "./mock-console";

/**
 * A helper to 'run' wrangler commands for tests.
 */
export async function runWrangler(cmd?: string) {
  try {
    await main(cmd?.split(" ") ?? []);
  } catch (e) {
    e.message = normalizeSlashes(stripTimings(e.message));
    throw e;
  }
}
