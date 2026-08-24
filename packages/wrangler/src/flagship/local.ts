import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { getDefaultPersistRoot } from "../dev/miniflare";
import type { Config } from "@cloudflare/workers-utils";
import type { FlagshipAdmin } from "miniflare";

const LOCAL_BINDING_NAME = "FLAGS";

function materialise<T>(value: T): T {
	return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

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
	try {
		const admin = await mf.getFlagshipBindingAPI(LOCAL_BINDING_NAME);
		return materialise(await closure(admin()));
	} finally {
		await mf.dispose();
	}
}
