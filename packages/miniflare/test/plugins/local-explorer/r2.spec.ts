import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	zR2BucketDeleteObjectResponse,
	zR2BucketDeleteObjectsResponse,
	zR2BucketGetObjectResponse,
	zR2BucketListObjectsResponse,
	zR2BucketPutObjectResponse,
	zR2ListBucketsResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
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

describe("R2 API", () => {
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
							ANOTHER_BUCKET: { type: "r2", name: "another-bucket" },
						},
					},
				},
			],
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /r2/buckets", () => {
		test("lists all available R2 buckets", async ({ expect }) => {
			const response = await mf.dispatchFetch(`${BASE_URL}/r2/buckets`);

			const data = await expectValidResponse(
				response,
				zR2ListBucketsResponse,
				expect
			);
			expect(data.result?.buckets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "test-bucket" }),
					expect.objectContaining({ name: "another-bucket" }),
				])
			);
			expect(data.result_info).toMatchObject({
				total_count: 2,
			});
		});
	});

	describe("GET /r2/buckets/:bucket_name/objects", () => {
		test("lists objects in a bucket", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("test-object-1.txt", "content1");
			await r2.put("test-object-2.txt", "content2");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects`
			);

			const data = await expectValidResponse(
				response,
				zR2BucketListObjectsResponse,
				expect
			);
			expect(data.result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ key: "test-object-1.txt" }),
					expect.objectContaining({ key: "test-object-2.txt" }),
				])
			);
		});

		test("filters objects by prefix", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("folder1/file1.txt", "content1");
			await r2.put("folder1/file2.txt", "content2");
			await r2.put("folder2/file3.txt", "content3");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects?prefix=folder1/`
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as { result?: { key: string }[] };
			expect(data.result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ key: "folder1/file1.txt" }),
					expect.objectContaining({ key: "folder1/file2.txt" }),
				])
			);
			expect(data.result?.some((obj) => obj.key === "folder2/file3.txt")).toBe(
				false
			);
		});

		test("returns delimited prefixes for directory navigation", async ({
			expect,
		}) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("dir1/file1.txt", "content1");
			await r2.put("dir1/subdir/file2.txt", "content2");
			await r2.put("dir2/file3.txt", "content3");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects?delimiter=/`
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as {
				result_info?: { delimited?: string[] };
			};
			expect(data.result_info?.delimited).toEqual(
				expect.arrayContaining(["dir1/", "dir2/"])
			);
		});

		test("only returns objects after start_after", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("start-after/a.txt", "a");
			await r2.put("start-after/b.txt", "b");
			await r2.put("start-after/c.txt", "c");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects?prefix=start-after/&start_after=start-after/a.txt`
			);

			const data = await expectValidResponse(
				response,
				zR2BucketListObjectsResponse,
				expect
			);
			expect(data.result?.map((obj) => obj.key)).toEqual([
				"start-after/b.txt",
				"start-after/c.txt",
			]);
		});

		test("paginates with cursor after start_after", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("start-after-page/a.txt", "a");
			await r2.put("start-after-page/b.txt", "b");
			await r2.put("start-after-page/c.txt", "c");
			const listUrl = `${BASE_URL}/r2/buckets/test-bucket/objects?prefix=start-after-page/&start_after=start-after-page/a.txt&per_page=1`;

			const firstPage = await expectValidResponse(
				await mf.dispatchFetch(listUrl),
				zR2BucketListObjectsResponse,
				expect
			);
			expect(firstPage.result?.map((obj) => obj.key)).toEqual([
				"start-after-page/b.txt",
			]);
			const cursor = firstPage.result_info?.cursor;
			expect(cursor).toBeDefined();

			const secondPage = await expectValidResponse(
				await mf.dispatchFetch(
					`${listUrl}&cursor=${encodeURIComponent(cursor ?? "")}`
				),
				zR2BucketListObjectsResponse,
				expect
			);
			expect(secondPage.result?.map((obj) => obj.key)).toEqual([
				"start-after-page/c.txt",
			]);
		});

		test("addresses an unlisted bucket", async ({ expect }) => {
			const response = await dispatchFetchWithRetry(
				mf,
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: [],
			});
		});
	});

	describe("GET /r2/buckets/:bucket_name/objects/:object_key", () => {
		test("returns object content", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("download-test.txt", "test content for download", {
				httpMetadata: { contentType: "text/plain" },
			});

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/download-test.txt`
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("test content for download");
			expect(response.headers.get("Content-Type")).toBe("text/plain");
			expect(response.headers.get("ETag")).toBeTruthy();
		});

		test("returns 304 when If-None-Match matches the object's ETag", async ({
			expect,
		}) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			const object = await r2.put("conditional-etag.txt", "sample");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/conditional-etag.txt`,
				{ headers: { "If-None-Match": object.httpEtag } }
			);

			const body = await response.text();
			expect(response.status).toBe(304);
			expect(body).toBe("");
		});

		test("returns 304 when If-Modified-Since is after the object's modification time", async ({
			expect,
		}) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("conditional-date.txt", "sample");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/conditional-date.txt`,
				{ headers: { "If-Modified-Since": "Fri, 01 Jan 2100 00:00:00 GMT" } }
			);

			const body = await response.text();
			expect(response.status).toBe(304);
			expect(body).toBe("");
		});

		test("returns object content when If-None-Match does not match", async ({
			expect,
		}) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("conditional-miss.txt", "sample");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/conditional-miss.txt`,
				{ headers: { "If-None-Match": '"different-etag"' } }
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("sample");
		});

		test("returns metadata only when cf-metadata-only header is set", async ({
			expect,
		}) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("metadata-test.txt", "some content", {
				httpMetadata: { contentType: "text/plain" },
				customMetadata: { author: "test-user", version: "1.0" },
			});

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/metadata-test.txt`,
				{
					headers: { "cf-metadata-only": "true" },
				}
			);

			const data = await expectValidResponse(
				response,
				zR2BucketGetObjectResponse,
				expect
			);
			expect(data.result).toMatchObject({
				key: "metadata-test.txt",
				http_metadata: { contentType: "text/plain" },
				custom_metadata: { author: "test-user", version: "1.0" },
			});
		});

		test("returns 404 for non-existent object", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/non-existent-object.txt`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10007 })],
			});
		});

		test("returns object-not-found for an unlisted bucket", async ({
			expect,
		}) => {
			const response = await dispatchFetchWithRetry(
				mf,
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects/some-object.txt`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10007 })],
			});
		});

		test("handles URL-encoded object keys", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			const specialKey = "path/to/file with spaces.txt";
			await r2.put(specialKey, "special content");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/${encodeURIComponent(
					specialKey
				)}`
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("special content");
		});
	});

	describe("PUT /r2/buckets/:bucket_name/objects/:object_key", () => {
		test("uploads a new object", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/upload-test.txt`,
				{
					method: "PUT",
					headers: { "content-type": "text/plain" },
					body: "uploaded content",
				}
			);

			const data = await expectValidResponse(
				response,
				zR2BucketPutObjectResponse,
				expect
			);
			expect(data.result).toMatchObject({
				key: "upload-test.txt",
			});

			// Verify the object was uploaded
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			const obj = await r2.get("upload-test.txt");
			expect(await obj?.text()).toBe("uploaded content");
		});

		test("uploads object with custom metadata", async ({ expect }) => {
			const customMetadata = { author: "test", version: "2.0" };

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/metadata-upload.txt`,
				{
					method: "PUT",
					headers: {
						"content-type": "application/json",
						"cf-r2-custom-metadata": JSON.stringify(customMetadata),
					},
					body: '{"test": "data"}',
				}
			);

			expect(response.status).toBe(200);
			// Consume response body to avoid unhandled error
			await response.json();

			// Verify metadata
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			const obj = await r2.head("metadata-upload.txt");
			expect(obj?.customMetadata).toEqual(customMetadata);
		});

		test("uploads to an unlisted bucket", async ({ expect }) => {
			const response = await dispatchFetchWithRetry(
				mf,
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects/some-object.txt`,
				{
					method: "PUT",
					body: "content",
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: { key: "some-object.txt" },
			});
			const getResponse = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects/some-object.txt`
			);
			expect(await getResponse.text()).toBe("content");
		});

		test("returns error for invalid custom metadata JSON", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/bad-metadata.txt`,
				{
					method: "PUT",
					headers: {
						"cf-r2-custom-metadata": "not valid json",
					},
					body: "content",
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					expect.objectContaining({ message: "Invalid custom metadata JSON" }),
				],
			});
		});
	});

	describe("DELETE /r2/buckets/:bucket_name/objects/:object_key", () => {
		test.for([
			["single-delete.txt", "single-delete.txt"],
			["folder/file.txt", "folder/file.txt"],
			["folder/space #%.txt", "folder%2Fspace%20%23%25.txt"],
		])(
			"deletes only the requested object %s",
			async ([key, path], { expect }) => {
				const r2 = await mf.getR2Bucket("TEST_BUCKET");
				const otherBucket = await mf.getR2Bucket("ANOTHER_BUCKET");
				await r2.put(key, "delete me");
				await r2.put(`${key}.keep`, "keep me");
				await otherBucket.put(key, "keep in other bucket");

				const response = await mf.dispatchFetch(
					`${BASE_URL}/r2/buckets/test-bucket/objects/${path}`,
					{ method: "DELETE" }
				);

				const data = await expectValidResponse(
					response,
					zR2BucketDeleteObjectResponse,
					expect
				);
				expect(data.result).toEqual({ key });
				expect(await r2.get(key)).toBeNull();
				expect(await (await r2.get(`${key}.keep`))?.text()).toBe("keep me");
				expect(await (await otherBucket.get(key))?.text()).toBe(
					"keep in other bucket"
				);
			}
		);

		test("succeeds when the object does not exist", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/missing.txt`,
				{ method: "DELETE" }
			);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: { key: "missing.txt" },
			});
		});
	});

	describe("DELETE /r2/buckets/:bucket_name/objects", () => {
		test("deletes objects from bucket", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			await r2.put("delete-me-1.txt", "content1");
			await r2.put("delete-me-2.txt", "content2");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["delete-me-1.txt", "delete-me-2.txt"]),
				}
			);

			const data = await expectValidResponse(
				response,
				zR2BucketDeleteObjectsResponse,
				expect
			);
			expect(data.result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ key: "delete-me-1.txt" }),
					expect.objectContaining({ key: "delete-me-2.txt" }),
				])
			);

			// Verify objects were deleted
			expect(await r2.head("delete-me-1.txt")).toBeNull();
			expect(await r2.head("delete-me-2.txt")).toBeNull();
		});

		test("succeeds even if objects do not exist", async ({ expect }) => {
			// R2 delete is idempotent
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["non-existent-1.txt", "non-existent-2.txt"]),
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });
		});

		test("deletes from an unlisted bucket", async ({ expect }) => {
			const response = await dispatchFetchWithRetry(
				mf,
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["some-key.txt"]),
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ success: true });
		});

		test("returns error for empty keys array", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([]),
				}
			);

			expect(response.status).toBe(400);
			// Consume response body to avoid unhandled error
			await response.json();
		});
	});
});

test("addresses arbitrary bucket IDs without an R2 binding", async ({
	expect,
}) => {
	const mf = createUnboundStorageExplorer();

	try {
		await mf.ready;
		const objectUrl = `${BASE_URL}/r2/buckets/arbitrary-bucket/objects/unbound.txt`;
		const putResponse = await dispatchFetchWithRetry(mf, objectUrl, {
			method: "PUT",
			body: "unbound-content",
		});
		expect(putResponse.status).toBe(200);
		expect(await putResponse.json()).toMatchObject({ success: true });

		const getResponse = await dispatchFetchWithRetry(mf, objectUrl);
		expect(getResponse.status).toBe(200);
		expect(await getResponse.text()).toBe("unbound-content");

		const deleteResponse = await dispatchFetchWithRetry(mf, objectUrl, {
			method: "DELETE",
		});
		expect(
			await expectValidResponse(
				deleteResponse,
				zR2BucketDeleteObjectResponse,
				expect
			)
		).toMatchObject({ result: { key: "unbound.txt" } });
		const missingResponse = await dispatchFetchWithRetry(mf, objectUrl);
		expect(missingResponse.status).toBe(404);
		await missingResponse.json();
	} finally {
		await disposeWithRetry(mf);
	}
});

test("routes arbitrary bucket IDs through the shared-storage owner", async ({
	expect,
}) => {
	const { owner, client } = await createSharedStorageExplorerPair();

	try {
		await client.ready;
		const objectUrl = `${BASE_URL}/r2/buckets/arbitrary-bucket/objects/shared.txt`;
		const putResponse = await dispatchFetchWithRetry(client, objectUrl, {
			method: "PUT",
			body: "written-through-client",
		});
		expect(putResponse.status).toBe(200);
		expect(await putResponse.json()).toMatchObject({ success: true });

		const getResponse = await dispatchFetchWithRetry(owner, objectUrl);
		expect(getResponse.status).toBe(200);
		expect(await getResponse.text()).toBe("written-through-client");

		const deleteResponse = await dispatchFetchWithRetry(client, objectUrl, {
			method: "DELETE",
		});
		expect(
			await expectValidResponse(
				deleteResponse,
				zR2BucketDeleteObjectResponse,
				expect
			)
		).toMatchObject({ result: { key: "shared.txt" } });
		const missingResponse = await dispatchFetchWithRetry(owner, objectUrl);
		expect(missingResponse.status).toBe(404);
		await missingResponse.json();
	} finally {
		await Promise.all([disposeWithRetry(client), disposeWithRetry(owner)]);
	}
});
