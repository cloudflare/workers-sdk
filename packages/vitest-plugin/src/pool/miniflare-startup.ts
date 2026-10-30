import util from "node:util";
import type { Miniflare } from "miniflare";

type MiniflareLifecycle = Pick<Miniflare, "dispose" | "ready">;
const debug = util.debuglog("vitest-plugin");

/**
 * Waits for a Miniflare instance to become ready, disposing it if startup
 * fails.
 *
 * @param mf - Miniflare instance whose startup should complete.
 * @returns The ready Miniflare instance.
 */
export async function waitForMiniflareReady<T extends MiniflareLifecycle>(
	mf: T
): Promise<T> {
	try {
		await mf.ready;
		return mf;
	} catch (error) {
		try {
			await mf.dispose();
		} catch (disposeError) {
			debug("miniflare startup cleanup rejected: %O", disposeError);
		}
		throw error;
	}
}
