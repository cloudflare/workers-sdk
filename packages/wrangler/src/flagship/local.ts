import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { getDefaultPersistRoot } from "../dev/miniflare";
import type { Config } from "@cloudflare/workers-utils";
import type { FlagshipAdmin } from "miniflare";

const LOCAL_BINDING_NAME = "FLAGS";

/**
 * Copy a value returned by the local admin API into plain data.
 *
 * Miniflare's proxy serialises arrays by value but hands back single objects
 * as heap-backed stubs, which are poisoned once the instance is disposed.
 * Copying while the instance is still alive lets callers use the result
 * afterwards. The admin API only ever returns JSON-shaped data.
 *
 * @param value The value returned by the closure.
 * @returns An equivalent value holding no references to the instance.
 */
function materialise<T>(value: T): T {
	return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * Open the local Flagship flag store for an app and run a closure against its
 * admin API, disposing the Miniflare instance afterwards.
 *
 * The store is keyed by `appId` and lives in the same local persistence
 * directory `wrangler dev` uses, so writes made here are visible to a
 * subsequent dev session for a binding configured with the same `app_id`.
 *
 * The closure must fully resolve anything it returns: the admin API is reached
 * over RPC, and its stubs are poisoned once the instance is disposed. Resolved
 * results are copied out before disposal, so they stay usable afterwards.
 *
 * @param persistTo Overrides the local persistence directory.
 * @param config The resolved Wrangler configuration.
 * @param appId The Flagship app whose local store should be opened.
 * @param closure Receives the admin API for the local store.
 * @returns Whatever the closure returns.
 */
export async function usingLocalFlagshipAPI<T>(
	persistTo: string | undefined,
	config: Config,
	appId: string,
	closure: (admin: FlagshipAdmin) => Promise<T>
): Promise<T> {
	const persist = getLocalPersistencePath(persistTo, config);
	const resourcePersistencePath = getDefaultPersistRoot(persist);
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			script:
				'addEventListener("fetch", (e) => e.respondWith(new Response(null, { status: 404 })))',
			resourcePersistencePath,
			flagship: { [LOCAL_BINDING_NAME]: { app_id: appId } },
		})
	);
	const admin = await mf.getFlagshipBindingAPI(LOCAL_BINDING_NAME);
	try {
		return materialise(await closure(admin()));
	} finally {
		await mf.dispose();
	}
}
