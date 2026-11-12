import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { disposeWithRetry, singleModuleManifest } from "../../test-shared";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;
const NAMESPACE_ID = "name-worker-NameDO";

// https://github.com/cloudflare/workers-sdk/issues/16851
describe("Local Explorer and ctx.id.name", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			workers: [
				{
					config: {
						name: "name-worker",
						compatibilityDate: "2026-03-20",
						compatibilityFlags: ["nodejs_compat"],
						manifest: singleModuleManifest(`
					import { DurableObject } from "cloudflare:workers";
					export class NameDO extends DurableObject {
						whoami() { return this.ctx.id.name ?? null; }
					}
					export default {
						async fetch(request, env) {
							const url = new URL(request.url);
							const name = url.searchParams.get("name");
							if (url.pathname === "/hex") {
								return Response.json({ hex: env.NAME_DO.idFromName(name).toString() });
							}
							return Response.json({ name: await env.NAME_DO.getByName(name).whoami() });
						}
					}
				`),
						env: {
							NAME_DO: {
								type: "durable-object",
								worker: "name-worker",
								exportName: "NameDO",
							},
						},
						exports: {
							NameDO: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("querying an object by id in the explorer does not hide its name from later named calls", async ({
		expect,
	}) => {
		const hexRes = await mf.dispatchFetch("http://localhost/hex?name=carol");
		const { hex } = (await hexRes.json()) as { hex: string };

		const queryRes = await mf.dispatchFetch(
			`${BASE_URL}/workers/durable_objects/namespaces/${NAMESPACE_ID}/query`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					durable_object_id: hex,
					queries: [{ sql: "SELECT 1" }],
				}),
			}
		);
		await queryRes.text();

		const res = await mf.dispatchFetch("http://localhost/who?name=carol");
		expect(await res.json()).toEqual({ name: "carol" });
	});
});
