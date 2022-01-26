import { main } from "../index";

/**
 * A helper to 'run' wrangler commands for tests.
 */
export async function runWrangler(cmd?: string) {
  await main(cmd?.split(" ") ?? []);
}
