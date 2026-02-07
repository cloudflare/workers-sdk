import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { LOCAL_EXPLORER_API_PATH } from "../../../src/plugins/core/constants";
import {
	zWorkersKvNamespaceDeleteKeyValuePairResponse,
	zWorkersKvNamespaceGetMultipleKeyValuePairsResponse,
	zWorkersKvNamespaceListANamespaceSKeysResponse,
	zWorkersKvNamespaceListNamespacesResponse,
	zWorkersKvNamespaceWriteKeyValuePairWithMetadataResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import { disposeWithRetry } from "../../test-shared";
import { expectValidResponse } from "./helpers";

const BASE_URL = `http://localhost${LOCAL_EXPLORER_API_PATH}`;

describe("KV API", () => {
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
				ANOTHER_KV: "another-kv-id",
				ZEBRA_KV: "zebra-kv-id",
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /storage/kv/namespaces", () => {
		test("lists available KV namespaces with default pagination", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces`
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceListNamespacesResponse
			);
			expect(data.result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: "test-kv-id", title: "TEST_KV" }),
					expect.objectContaining({ id: "another-kv-id", title: "ANOTHER_KV" }),
					expect.objectContaining({ id: "zebra-kv-id", title: "ZEBRA_KV" }),
				])
			);
			expect(data.result_info).toMatchObject({
				count: 3,
				page: 1,
				per_page: 20,
				total_count: 3,
			});
		});

		test("sorts namespaces by id", async ({ expect }) => {
			let response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				result: [
					expect.objectContaining({ id: "another-kv-id" }),
					expect.objectContaining({ id: "test-kv-id" }),
					expect.objectContaining({ id: "zebra-kv-id" }),
				],
			});

			response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces?direction=desc`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				result: [
					expect.objectContaining({ id: "zebra-kv-id" }),
					expect.objectContaining({ id: "test-kv-id" }),
					expect.objectContaining({ id: "another-kv-id" }),
				],
			});
		});

		test("sorts namespaces by title", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces?order=title&direction=desc`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				result: [
					expect.objectContaining({ title: "ZEBRA_KV" }),
					expect.objectContaining({ title: "TEST_KV" }),
					expect.objectContaining({ title: "ANOTHER_KV" }),
				],
			});
		});

		test("pagination works", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces?per_page=2&page=2`
			);

			expect(response.status).toBe(200);
			// Sorted by ID: "another-kv-id", "test-kv-id", "zebra-kv-id"
			// Page 2 with per_page=2 should return only "zebra-kv-id"
			expect(await response.json()).toMatchObject({
				result: [expect.objectContaining({ id: "zebra-kv-id" })],
				result_info: {
					count: 1,
					page: 2,
					per_page: 2,
					total_count: 3,
				},
			});
		});

		test("returns empty result for page beyond total", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces?per_page=20&page=100`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				result: [],
				result_info: {
					count: 0,
					page: 100,
					per_page: 20,
					total_count: 3,
				},
			});
		});
	});

	describe("GET /storage/kv/namespaces/:namespaceId/keys", () => {
		test("lists keys in a namespace", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("test-key-1", "value1");
			await kv.put("test-key-2", "value2");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys`
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceListANamespaceSKeysResponse
			);
			expect(data.result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "test-key-1" }),
					expect.objectContaining({ name: "test-key-2" }),
				])
			);
		});

		test("respects limit parameter", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			for (let i = 0; i < 15; i++) {
				await kv.put(`limit-test-${i}`, "value");
			}

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=10`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result_info: expect.objectContaining({ count: 10 }),
			});
		});

		test("returns 404 for non-existent namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/keys`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ message: "Namespace not found" })],
			});
		});

		test("filters keys by prefix", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("users:alice", "value1");
			await kv.put("users:bob", "value2");
			await kv.put("posts:first", "value3");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?prefix=users:`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: expect.arrayContaining([
					expect.objectContaining({ name: "users:alice" }),
					expect.objectContaining({ name: "users:bob" }),
				]),
				result_info: expect.objectContaining({ count: 2 }),
			});
		});

		test("returns exact prefix match", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("exact-match", "value1");
			await kv.put("exact-match-extended", "value2");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?prefix=exact-match`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: expect.arrayContaining([
					expect.objectContaining({ name: "exact-match" }),
					expect.objectContaining({ name: "exact-match-extended" }),
				]),
				result_info: expect.objectContaining({ count: 2 }),
			});
		});

		test("returns empty result for non-matching prefix", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?prefix=nonexistent-prefix-xyz`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: [],
				result_info: expect.objectContaining({ count: 0 }),
			});
		});
	});

	describe("GET /storage/kv/namespaces/:namespaceId/values/:keyName", () => {
		test("returns value for existing key", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("get-test-key", "test-value-123");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/get-test-key`
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("test-value-123");
		});

		test("returns 404 for non-existent key", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/non-existent-key-xyz`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ message: "Key not found" })],
			});
		});

		test("returns 404 for non-existent namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/values/some-key`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ message: "Namespace not found" })],
			});
		});

		test("handles URL-encoded key names", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			const specialKey = "key:with:colons";
			await kv.put(specialKey, "special-value");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/${encodeURIComponent(specialKey)}`
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("special-value");
		});
	});

	describe("PUT /storage/kv/namespaces/:namespaceId/values/:keyName", () => {
		test("writes a new value", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/put-test-key`,
				{
					method: "PUT",
					body: "new-value",
				}
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceWriteKeyValuePairWithMetadataResponse
			);
			expect(data.success).toBe(true);

			// Verify the value was written
			const kv = await mf.getKVNamespace("TEST_KV");
			expect(await kv.get("put-test-key")).toBe("new-value");
		});

		test("overwrites existing value", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("overwrite-key", "old-value");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/overwrite-key`,
				{
					method: "PUT",
					body: "updated-value",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });
			expect(await kv.get("overwrite-key")).toBe("updated-value");
		});

		test("returns 404 for non-existent namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/values/some-key`,
				{
					method: "PUT",
					body: "value",
				}
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ message: "Namespace not found" })],
			});
		});
	});

	describe("DELETE /storage/kv/namespaces/:namespaceId/values/:keyName", () => {
		test("deletes an existing key", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("delete-test-key", "value-to-delete");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/delete-test-key`,
				{
					method: "DELETE",
				}
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceDeleteKeyValuePairResponse
			);
			expect(data.success).toBe(true);

			// Verify the value was deleted
			expect(await kv.get("delete-test-key")).toBeNull();
		});

		test("succeeds even if key does not exist", async ({ expect }) => {
			// KV delete is idempotent - deleting non-existent key should succeed
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/definitely-does-not-exist`,
				{
					method: "DELETE",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });
		});

		test("returns 404 for non-existent namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/values/some-key`,
				{
					method: "DELETE",
				}
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ message: "Namespace not found" })],
			});
		});

		test("handles URL-encoded key names", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			const specialKey = "delete:key:with:colons";
			await kv.put(specialKey, "value");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/${encodeURIComponent(specialKey)}`,
				{
					method: "DELETE",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });
			expect(await kv.get(specialKey)).toBeNull();
		});
	});

	describe("POST /storage/kv/namespaces/:namespaceId/bulk/get", () => {
		test("returns multiple key-value pairs and null for non-existing keys", async ({
			expect,
		}) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("bulk-key-1", "value-1");
			await kv.put("bulk-key-2", "value-2");
			await kv.put("bulk-key-3", "value-3");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						keys: [
							"bulk-key-1",
							"bulk-key-2",
							"bulk-key-3",
							"non-existent-key",
						],
					}),
				}
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceGetMultipleKeyValuePairsResponse
			);
			expect(data.success).toBe(true);
			expect(data.result).toMatchObject({
				values: {
					"bulk-key-1": "value-1",
					"bulk-key-2": "value-2",
					"bulk-key-3": "value-3",
					"non-existent-key": null,
				},
			});
		});

		test("returns null values as success if all keys are non-existent", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						keys: ["does-not-exist-1", "does-not-exist-2"],
					}),
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: {
					values: {
						"does-not-exist-1": null,
						"does-not-exist-2": null,
					},
				},
			});
		});

		test("returns 404 for non-existent namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ keys: ["key1"] }),
				}
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ message: "Namespace not found" })],
			});
		});
	});
});
