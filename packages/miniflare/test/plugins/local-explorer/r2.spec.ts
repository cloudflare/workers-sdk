import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { LOCAL_EXPLORER_API_PATH } from "../../../src/plugins/core/constants";
import {
	zR2BucketDeleteObjectsResponse,
	zR2BucketGetObjectResponse,
	zR2BucketListObjectsResponse,
	zR2BucketPutObjectResponse,
	zR2ListBucketsResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import { disposeWithRetry } from "../../test-shared";
import { expectValidResponse } from "./helpers";

const BASE_URL = `http://localhost${LOCAL_EXPLORER_API_PATH}`;

describe("R2 API", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("user worker"); } }`,
			unsafeLocalExplorer: true,
			r2Buckets: {
				TEST_BUCKET: "test-bucket",
				ANOTHER_BUCKET: "another-bucket",
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /r2/buckets", () => {
		test("lists all available R2 buckets", async ({ expect }) => {
			const response = await mf.dispatchFetch(`${BASE_URL}/r2/buckets`);

			const data = await expectValidResponse(response, zR2ListBucketsResponse);
			expect(data.result?.buckets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "test-bucket" }),
					expect.objectContaining({ name: "another-bucket" }),
				])
			);
			expect(data.result_info).toMatchObject({
				count: 2,
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
				zR2BucketListObjectsResponse
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

		test("returns 404 for non-existent bucket", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10006 })],
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
				zR2BucketGetObjectResponse
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

		test("returns 404 for non-existent bucket", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects/some-object.txt`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10006 })],
			});
		});

		test("handles URL-encoded object keys", async ({ expect }) => {
			const r2 = await mf.getR2Bucket("TEST_BUCKET");
			const specialKey = "path/to/file with spaces.txt";
			await r2.put(specialKey, "special content");

			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/test-bucket/objects/${encodeURIComponent(specialKey)}`
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
				zR2BucketPutObjectResponse
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

		test("returns 404 for non-existent bucket", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects/some-object.txt`,
				{
					method: "PUT",
					body: "content",
				}
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10006 })],
			});
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
				zR2BucketDeleteObjectsResponse
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

		test("returns 404 for non-existent bucket", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/r2/buckets/NON_EXISTENT/objects`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["some-key.txt"]),
				}
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10006 })],
			});
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
