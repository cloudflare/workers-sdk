import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { disposeWithRetry, singleModuleManifest } from "../../test-shared";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;
const OBJECT_KEY = "conditional.txt";
const OBJECT_BODY = "conditional content";

describe("R2 conditional GET", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("user worker"); } }`
						),
						env: {
							TEST_BUCKET: { type: "r2", name: "test-bucket" },
						},
					},
				},
			],
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("returns 304 when if-none-match matches the object's ETag", async ({
		expect,
	}) => {
		const r2 = await mf.getR2Bucket("TEST_BUCKET");
		const object = await r2.put(OBJECT_KEY, OBJECT_BODY);
		expect(object).not.toBeNull();

		const response = await mf.dispatchFetch(
			`${BASE_URL}/r2/buckets/test-bucket/objects/${OBJECT_KEY}`,
			{ headers: { "if-none-match": object?.etag ?? "" } }
		);
		const body = await response.text();

		expect(response.status).toBe(304);
		expect(body).toBe("");
	});

	test("returns 304 when if-modified-since is later than the object's upload time", async ({
		expect,
	}) => {
		const r2 = await mf.getR2Bucket("TEST_BUCKET");
		await r2.put(OBJECT_KEY, OBJECT_BODY);

		const response = await mf.dispatchFetch(
			`${BASE_URL}/r2/buckets/test-bucket/objects/${OBJECT_KEY}`,
			{ headers: { "if-modified-since": "Fri, 01 Jan 2100 00:00:00 GMT" } }
		);
		const body = await response.text();

		expect(response.status).toBe(304);
		expect(body).toBe("");
	});

	test("returns the object body when if-none-match does not match", async ({
		expect,
	}) => {
		const r2 = await mf.getR2Bucket("TEST_BUCKET");
		await r2.put(OBJECT_KEY, OBJECT_BODY);

		const response = await mf.dispatchFetch(
			`${BASE_URL}/r2/buckets/test-bucket/objects/${OBJECT_KEY}`,
			{ headers: { "if-none-match": '"not-the-object-etag"' } }
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(OBJECT_BODY);
	});
});
