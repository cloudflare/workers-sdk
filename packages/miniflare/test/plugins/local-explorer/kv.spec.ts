import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	zWorkersKvNamespaceDeleteKeyValuePairResponse,
	zWorkersKvNamespaceDeleteMultipleKeyValuePairsResponse,
	zWorkersKvNamespaceGetMultipleKeyValuePairsResponse,
	zWorkersKvNamespaceListANamespaceSKeysResponse,
	zWorkersKvNamespaceListNamespacesResponse,
	zWorkersKvNamespaceWriteKeyValuePairWithMetadataResponse,
	zWorkersKvNamespaceWriteMultipleKeyValuePairsResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import {
	executeKVBulkOperations,
	KV_BULK_REQUEST_MAX_BYTES,
} from "../../../src/workers/local-explorer/resources/kv-bulk";
import {
	dispatchFetchWithRetry,
	disposeWithRetry,
	singleModuleManifest,
} from "../../test-shared";
import {
	createSharedStorageExplorerPair,
	createUnboundStorageExplorer,
	expectValidResponse,
} from "./helpers";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

describe("KV API", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			workers: [
				{
					config: {
						type: "worker",
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("user worker"); } }`
						),
						env: {
							TEST_KV: { type: "kv", id: "test-kv-id" },
							ANOTHER_KV: { type: "kv", id: "another-kv-id" },
							ZEBRA_KV: { type: "kv", id: "zebra-kv-id" },
						},
					},
				},
			],
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /storage/kv/namespaces", () => {
		test("lists all available KV namespaces", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces`
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceListNamespacesResponse,
				expect
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
				zWorkersKvNamespaceListANamespaceSKeysResponse,
				expect
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

		test("addresses an unlisted namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/keys`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: [],
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
				errors: [expect.objectContaining({ code: 10009 })],
			});
		});

		test("returns key-not-found for an unlisted namespace", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/values/some-key`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10009 })],
			});
		});

		test("handles URL-encoded key names", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			const specialKey = "key:with:colons";
			await kv.put(specialKey, "special-value");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/${encodeURIComponent(
					specialKey
				)}`
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("special-value");
		});

		test("returns raw bytes for ArrayBuffer values", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255]);
			await kv.put("binary-get-key", bytes.buffer);

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/binary-get-key`
			);

			expect(response.status).toBe(200);
			expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
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
				zWorkersKvNamespaceWriteKeyValuePairWithMetadataResponse,
				expect
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

		test("writes to an unlisted namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/values/some-key`,
				{
					method: "PUT",
					body: "value",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
			});
			const getResponse = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/values/some-key`
			);
			expect(await getResponse.text()).toBe("value");
		});

		test("writes streamed binary values", async ({ expect }) => {
			const bytes = Uint8Array.from([255, 0, 10, 20, 30, 200]);
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/put-stream-key`,
				{
					body: new Blob([bytes]).stream(),
					duplex: "half",
					headers: {
						"Content-Type": "application/octet-stream",
					},
					method: "PUT",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });

			const kv = await mf.getKVNamespace("TEST_KV");
			const stored = await kv.get("put-stream-key", { type: "arrayBuffer" });

			expect(stored).not.toBeNull();
			if (stored === null) {
				throw new Error("Expected put-stream-key to be stored in KV");
			}
			expect(new Uint8Array(stored)).toEqual(bytes);
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
				zWorkersKvNamespaceDeleteKeyValuePairResponse,
				expect
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

		test("deletes from an unlisted namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/values/some-key`,
				{
					method: "DELETE",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });
		});

		test("handles URL-encoded key names", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			const specialKey = "delete:key:with:colons";
			await kv.put(specialKey, "value");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/values/${encodeURIComponent(
					specialKey
				)}`,
				{
					method: "DELETE",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });
			expect(await kv.get(specialKey)).toBeNull();
		});
	});

	describe("bulk operation execution", () => {
		test("continues after failures and preserves request order", async ({
			expect,
		}) => {
			const calls: string[] = [];
			const result = await executeKVBulkOperations(
				[{ key: "first" }, { key: "fails" }, { key: "last" }],
				async ({ key }) => {
					calls.push(key);
					if (key === "fails") {
						throw new Error("storage failure");
					}
				}
			);

			expect(calls).toEqual(["first", "fails", "last"]);
			expect(result).toEqual({
				successful_key_count: 2,
				unsuccessful_keys: ["fails"],
			});
		});
	});

	describe("PUT /storage/kv/namespaces/:namespaceId/bulk", () => {
		test("uses the production request-size limit", ({ expect }) => {
			expect(KV_BULK_REQUEST_MAX_BYTES).toBe(100_000_000);
		});

		test("rejects a streamed request body over the production limit", async ({
			expect,
		}) => {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(KV_BULK_REQUEST_MAX_BYTES));
					controller.enqueue(new Uint8Array(1));
					controller.close();
				},
			});
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body,
					duplex: "half",
				}
			);

			expect(response.status).toBe(413);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [{ code: 10001 }],
			});
		});

		test("writes production value forms and reports the result", async ({
			expect,
		}) => {
			const expiration = Math.floor(Date.now() / 1000) + 120;
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([
						{ key: "bulk-text", value: "hello" },
						{
							key: "bulk-binary",
							value: "AAECf4D+/w==",
							base64: true,
						},
						{
							key: "bulk-metadata",
							value: "with metadata",
							metadata: { source: "bulk" },
						},
						{ key: "bulk-expiration", value: "absolute", expiration },
						{ key: "bulk-ttl", value: "ttl", expiration_ttl: 120 },
						{
							key: "bulk-ttl-precedence",
							value: "ttl wins",
							expiration: 1,
							expiration_ttl: 120,
						},
						{ key: "bulk-duplicate", value: "first" },
						{ key: "bulk-duplicate", value: "last" },
					]),
				}
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceWriteMultipleKeyValuePairsResponse,
				expect
			);
			expect(data.result).toEqual({
				successful_key_count: 8,
				unsuccessful_keys: [],
			});

			const kv = await mf.getKVNamespace("TEST_KV");
			expect(await kv.get("bulk-text")).toBe("hello");
			expect(await kv.get("bulk-duplicate")).toBe("last");
			const binary = await kv.get("bulk-binary", { type: "arrayBuffer" });
			expect(new Uint8Array(binary ?? new ArrayBuffer(0))).toEqual(
				Uint8Array.from([0, 1, 2, 127, 128, 254, 255])
			);
			const withMetadata = await kv.getWithMetadata("bulk-metadata");
			expect(withMetadata).toMatchObject({
				value: "with metadata",
				metadata: { source: "bulk" },
			});
			const listed = await kv.list();
			expect(
				listed.keys.find(({ name }) => name === "bulk-expiration")
			).toMatchObject({ expiration });
			expect(
				listed.keys.find(({ name }) => name === "bulk-ttl")?.expiration
			).toBeGreaterThan(Math.floor(Date.now() / 1000) + 50);
			expect(
				listed.keys.find(({ name }) => name === "bulk-ttl-precedence")
					?.expiration
			).toBeGreaterThan(Math.floor(Date.now() / 1000) + 50);
		});

		test("preflights every item before writing", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([
						{ key: "must-not-be-written", value: "value" },
						{ key: ".", value: "invalid" },
					]),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10001 })],
			});
			const kv = await mf.getKVNamespace("TEST_KV");
			expect(await kv.get("must-not-be-written")).toBeNull();
		});

		test("rejects invalid base64", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([
						{ key: "invalid-base64", value: "not base64!", base64: true },
					]),
				}
			);

			expect({
				status: response.status,
				body: await response.json(),
			}).toMatchObject({ status: 400, body: { success: false } });
		});

		test("rejects malformed JSON", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: "{",
				}
			);

			expect({
				status: response.status,
				body: await response.json(),
			}).toMatchObject({ status: 400, body: { success: false } });
		});

		test("enforces deterministic item constraints", async ({ expect }) => {
			const cases = [
				{
					item: { key: "é".repeat(257), value: "value" },
					status: 414,
				},
				{
					item: {
						key: "oversized-metadata",
						value: "value",
						metadata: { value: "x".repeat(1024) },
					},
					status: 413,
				},
				{
					item: {
						key: "invalid-expiration",
						value: "value",
						expiration_ttl: 59,
					},
					status: 400,
				},
			];

			for (const { item, status } of cases) {
				const response = await mf.dispatchFetch(
					`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk`,
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify([item]),
					}
				);

				expect(response.status).toBe(status);
				expect(await response.json()).toMatchObject({ success: false });
			}
		});

		test("rejects requests containing more than 10,000 items", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(
						Array.from({ length: 10_001 }, (_, index) => ({
							key: `key-${index}`,
							value: "value",
						}))
					),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ success: false });
		});

		test("writes to an unlisted namespace", async ({ expect }) => {
			const namespaceUrl = `${BASE_URL}/storage/kv/namespaces/unlisted-bulk-write`;
			const response = await mf.dispatchFetch(`${namespaceUrl}/bulk`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify([{ key: "key", value: "value" }]),
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: { successful_key_count: 1, unsuccessful_keys: [] },
			});
			const getResponse = await mf.dispatchFetch(`${namespaceUrl}/values/key`);
			expect(await getResponse.text()).toBe("value");
		});
	});

	describe("POST /storage/kv/namespaces/:namespaceId/bulk/delete", () => {
		test("deletes production key arrays and treats missing keys as success", async ({
			expect,
		}) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("bulk-delete-one", "one");
			await kv.put("bulk-delete-two", "two");
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/delete`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([
						"bulk-delete-one",
						"bulk-delete-missing",
						"bulk-delete-two",
					]),
				}
			);

			const data = await expectValidResponse(
				response,
				zWorkersKvNamespaceDeleteMultipleKeyValuePairsResponse,
				expect
			);
			expect(data.result).toEqual({
				successful_key_count: 3,
				unsuccessful_keys: [],
			});
			expect(await kv.get("bulk-delete-one")).toBeNull();
			expect(await kv.get("bulk-delete-two")).toBeNull();
		});

		test("rejects Wrangler object input", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/delete`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([{ name: "key" }]),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ success: false });
		});

		test("rejects requests containing more than 10,000 keys", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/delete`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(
						Array.from({ length: 10_001 }, (_, index) => `key-${index}`)
					),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ success: false });
		});

		test("preflights every key before deleting", async ({ expect }) => {
			const kv = await mf.getKVNamespace("TEST_KV");
			await kv.put("must-not-be-deleted", "value");
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/delete`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["must-not-be-deleted", ".."]),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ success: false });
			expect(await kv.get("must-not-be-deleted")).toBe("value");
		});

		test("deletes from an unlisted namespace", async ({ expect }) => {
			const namespaceUrl = `${BASE_URL}/storage/kv/namespaces/unlisted-bulk-delete`;
			const seedResponse = await mf.dispatchFetch(
				`${namespaceUrl}/values/key`,
				{
					method: "PUT",
					body: "value",
				}
			);
			await seedResponse.json();
			const response = await mf.dispatchFetch(`${namespaceUrl}/bulk/delete`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(["key"]),
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: { successful_key_count: 1, unsuccessful_keys: [] },
			});
			const getResponse = await mf.dispatchFetch(`${namespaceUrl}/values/key`);
			expect(getResponse.status).toBe(404);
			await getResponse.json();
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
				zWorkersKvNamespaceGetMultipleKeyValuePairsResponse,
				expect
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

		test("reads from an unlisted namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/NON_EXISTENT/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ keys: ["key1"] }),
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: { values: { key1: null } },
			});
		});
	});
});

test("addresses arbitrary namespace IDs without a KV binding", async ({
	expect,
}) => {
	const mf = createUnboundStorageExplorer();

	try {
		await mf.ready;
		const valueUrl = `${BASE_URL}/storage/kv/namespaces/arbitrary-namespace/values/unbound-key`;
		const putResponse = await dispatchFetchWithRetry(mf, valueUrl, {
			method: "PUT",
			body: "unbound-content",
		});
		expect(putResponse.status).toBe(200);
		expect(await putResponse.json()).toMatchObject({ success: true });

		const getResponse = await dispatchFetchWithRetry(mf, valueUrl);
		expect(getResponse.status).toBe(200);
		expect(await getResponse.text()).toBe("unbound-content");
	} finally {
		await disposeWithRetry(mf);
	}
});

test("routes arbitrary namespace IDs through the shared-storage owner", async ({
	expect,
}) => {
	const { owner, client } = await createSharedStorageExplorerPair();

	try {
		await client.ready;
		const valueUrl = `${BASE_URL}/storage/kv/namespaces/arbitrary-namespace/values/shared-key`;
		const putResponse = await dispatchFetchWithRetry(client, valueUrl, {
			method: "PUT",
			body: "written-through-client",
		});
		expect(putResponse.status).toBe(200);
		expect(await putResponse.json()).toMatchObject({ success: true });

		const getResponse = await dispatchFetchWithRetry(owner, valueUrl);
		expect(getResponse.status).toBe(200);
		expect(await getResponse.text()).toBe("written-through-client");

		const namespaceUrl = `${BASE_URL}/storage/kv/namespaces/arbitrary-namespace`;
		const bulkWriteResponse = await dispatchFetchWithRetry(
			client,
			`${namespaceUrl}/bulk`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify([
					{ key: "shared-bulk-one", value: "one" },
					{ key: "shared-bulk-two", value: "two" },
				]),
			}
		);
		expect(bulkWriteResponse.status).toBe(200);
		expect(await bulkWriteResponse.json()).toMatchObject({
			success: true,
			result: { successful_key_count: 2, unsuccessful_keys: [] },
		});

		const ownerBulkValueUrl = `${namespaceUrl}/values/shared-bulk-one`;
		const ownerBulkValueResponse = await dispatchFetchWithRetry(
			owner,
			ownerBulkValueUrl
		);
		expect(await ownerBulkValueResponse.text()).toBe("one");

		const bulkDeleteResponse = await dispatchFetchWithRetry(
			client,
			`${namespaceUrl}/bulk/delete`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(["shared-bulk-one", "shared-bulk-two"]),
			}
		);
		expect(bulkDeleteResponse.status).toBe(200);
		expect(await bulkDeleteResponse.json()).toMatchObject({
			success: true,
			result: { successful_key_count: 2, unsuccessful_keys: [] },
		});
		const deletedResponse = await dispatchFetchWithRetry(
			owner,
			ownerBulkValueUrl
		);
		expect(deletedResponse.status).toBe(404);
		await deletedResponse.json();
	} finally {
		await Promise.all([disposeWithRetry(client), disposeWithRetry(owner)]);
	}
});
