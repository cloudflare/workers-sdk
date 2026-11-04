import util from "node:util";
import type { Miniflare } from "miniflare";

type MiniflareLifecycle = Pick<Miniflare, "dispose" | "ready">;
const debug = util.debuglog("vitest-plugin");

/**
 * Waits for a Miniflare instance to become ready, disposing it if startup
 * fails.
 *
 * @param mf - Miniflare instance whose startup should complete.
 * @param log - Logs a failure to dispose the instance after its startup fails.
 * @returns The ready Miniflare instance.
 */
export async function waitForMiniflareReady<T extends MiniflareLifecycle>(
	mf: T,
	log: util.DebugLoggerFunction = debug
): Promise<T> {
	try {
		await mf.ready;
		return mf;
	} catch (error) {
		try {
			await mf.dispose();
		} catch (disposeError) {
			log("miniflare startup cleanup rejected: %O", disposeError);
		}
		throw error;
	}
}
