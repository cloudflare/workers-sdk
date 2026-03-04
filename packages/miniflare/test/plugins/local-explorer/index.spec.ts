import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { LOCAL_EXPLORER_API_PATH } from "../../../src/plugins/core/constants";
import { disposeWithRetry } from "../../test-shared";

const BASE_URL = `http://localhost${LOCAL_EXPLORER_API_PATH}`;

describe("Local Explorer API validation", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("user worker"); } }`,
			unsafeLocalExplorer: true,
			kvNamespaces: {
				TEST_KV: "test-kv-id",
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("query parameter validation", () => {
		test("returns 400 for invalid type in query parameter", async ({
			expect,
		}) => {
			// Test query validation on listKVKeys endpoint which still has query params
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=not-a-number`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message:
							'limit: Expected query param to be number but received "not-a-number"',
					},
				],
			});
		});

		test("returns 400 for invalid value (number out of range)", async ({
			expect,
		}) => {
			// Test with limit which has a minimum of 10
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=0`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "limit: Number must be greater than or equal to 10",
					},
				],
			});
		});

		test("returns 400 for limit exceeding maximum", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=1001`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "limit: Number must be less than or equal to 1000",
					},
				],
			});
		});
	});

	describe("request body validation", () => {
		test("returns 400 for invalid body type", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ keys: "not-an-array" }),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "keys: Expected array, received string",
					},
				],
			});
		});

		test("returns 400 for missing required keys field", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "keys: Required",
					},
				],
			});
		});
	});

	describe("error response format", () => {
		test("validation error responses follow Cloudflare API format", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=invalid`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message:
							'limit: Expected query param to be number but received "invalid"',
					},
				],
				messages: [],
				result: null,
			});
		});

		test("not found responses follow Cloudflare API format", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/non-existent-id/keys`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [{ code: 10000, message: "Namespace not found" }],
			});
		});
	});
});
