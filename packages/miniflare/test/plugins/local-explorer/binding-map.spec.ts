import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { disposeWithRetry } from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

// A dummy remote-proxy endpoint. Listing resources reads only the binding map,
// so this is never actually contacted.
const remoteProxyConnectionString = new URL(
	"http://127.0.0.1:9999/"
) as unknown as RemoteProxyConnectionString;

// Remote KV/R2/D1 bindings all share one proxy service (`kv:ns:remote`,
// `r2:bucket:remote`, `d1:db:remote`). Remote resources aren't supported in the
// local explorer, so they must be skipped rather than collapse to the literal id
// "remote" (a collision that would also leak a bogus "remote" entry). Local
// resources alongside them must still be surfaced.
describe("Local Explorer remote binding skipping", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("user worker"); } }`,
			unsafeLocalExplorer: true,
			kvNamespaces: {
				LOCAL_KV: "kv-local",
				REMOTE_KV_A: { id: "kv-a", remoteProxyConnectionString },
				REMOTE_KV_B: { id: "kv-b", remoteProxyConnectionString },
			},
			r2Buckets: {
				LOCAL_R2: "r2-local",
				REMOTE_R2_A: { id: "r2-a", remoteProxyConnectionString },
				REMOTE_R2_B: { id: "r2-b", remoteProxyConnectionString },
			},
			d1Databases: {
				LOCAL_D1: "d1-local",
				REMOTE_D1_A: { id: "d1-a", remoteProxyConnectionString },
				REMOTE_D1_B: { id: "d1-b", remoteProxyConnectionString },
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("skips remote KV namespaces, surfacing only local ones", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/storage/kv/namespaces`
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			result: Array<{ id: string }>;
		};
		const ids = body.result.map((ns) => ns.id).sort();
		expect(ids).toEqual(["kv-local"]);
	});

	test("skips remote R2 buckets, surfacing only local ones", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(`${BASE_URL}/r2/buckets`);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			result: { buckets: Array<{ name: string }> };
		};
		const names = body.result.buckets.map((b) => b.name).sort();
		expect(names).toEqual(["r2-local"]);
	});

	test("skips remote D1 databases, surfacing only local ones", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(`${BASE_URL}/d1/database`);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			result: Array<{ uuid: string }>;
		};
		const uuids = body.result.map((db) => db.uuid).sort();
		expect(uuids).toEqual(["d1-local"]);
	});
});
