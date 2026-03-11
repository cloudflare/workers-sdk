import * as fs from "node:fs";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw, mswR2handlers } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("r2 data catalog force flag", () => {
	mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	beforeEach(() => msw.use(...mswR2handlers));
	describe("object put", () => {
		it("should send catalog check header when force is NOT provided and NOT send header when flags are provided", async ({
			expect,
		}) => {
			let catalogHeaderSent = false;

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
					({ request }) => {
						catalogHeaderSent =
							request.headers.get("cf-r2-data-catalog-check") === "true";
						return HttpResponse.json(createFetchResult({}));
					}
				)
			);

			fs.writeFileSync("test.txt", "content");
			// 1. Don't provide flags
			await runWrangler(
				"r2 object put --remote my-bucket/test.txt --file test.txt"
			);

			expect(catalogHeaderSent).toBe(true);

			// 2. Provide --force flag
			await runWrangler(
				"r2 object put --remote my-bucket/test.txt --file test.txt --force"
			);

			expect(catalogHeaderSent).toBe(false);

			// 3. Set -y alias
			await runWrangler(
				"r2 object put --remote my-bucket/test.txt --file test.txt -y"
			);

			expect(catalogHeaderSent).toBe(false);
		});
		it("should show helpful error message on 409 catalog conflict", async ({
			expect,
		}) => {
			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
					() => {
						return new HttpResponse(
							"Data Catalog is enabled for this bucket. This operation could leave your bucket's Data Catalog in an invalid state.",
							{ status: 409, statusText: "Conflict" }
						);
					},
					{ once: true }
				)
			);

			fs.writeFileSync("test.txt", "content");

			await expect(
				runWrangler("r2 object put --remote my-bucket/test.txt --file test.txt")
			).rejects.toThrow(/Data catalog validation failed/);
		});
	});
	describe("object delete", () => {
		it("should send catalog check header when force is NOT provided and NOT send header when flags are provided", async ({
			expect,
		}) => {
			let catalogHeaderSent = false;

			msw.use(
				http.delete(
					"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
					({ request }) => {
						catalogHeaderSent =
							request.headers.get("cf-r2-data-catalog-check") === "true";
						return HttpResponse.json(createFetchResult({}));
					}
				)
			);

			await runWrangler("r2 object delete --remote my-bucket/test.txt");

			expect(catalogHeaderSent).toBe(true);

			await runWrangler("r2 object delete --remote my-bucket/test.txt --force");

			expect(catalogHeaderSent).toBe(false);

			await runWrangler("r2 object delete --remote my-bucket/test.txt -y");

			expect(catalogHeaderSent).toBe(false);
		});
		it("should show helpful error message on 409 catalog conflict", async ({
			expect,
		}) => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
					() => {
						return new HttpResponse(
							"Data Catalog is enabled for this bucket. This operation could leave your bucket's Data Catalog in an invalid state.",
							{ status: 409, statusText: "Conflict" }
						);
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler("r2 object delete --remote my-bucket/test.txt")
			).rejects.toThrow(/Data catalog validation failed/);
		});
	});
	describe("bulk put", () => {
		it("should send catalog check header for all objects when force is NOT provided", async ({
			expect,
		}) => {
			let catalogHeaderCount = 0;
			const bulkFile = "bulk.json";

			fs.writeFileSync("file1.txt", "content1");
			fs.writeFileSync("file2.txt", "content2");
			fs.writeFileSync(
				bulkFile,
				JSON.stringify([
					{ key: "key1", file: "file1.txt" },
					{ key: "key2", file: "file2.txt" },
				])
			);

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/objects/*",
					({ request }) => {
						if (request.headers.get("cf-r2-data-catalog-check") === "true") {
							catalogHeaderCount++;
						}
						return HttpResponse.json(createFetchResult({}));
					}
				)
			);

			await runWrangler(
				`r2 bulk put --remote my-bucket --filename ${bulkFile}`
			);

			expect(catalogHeaderCount).toBe(2); // Both uploads should have header
		});
		it("should NOT send catalog check header for bulk objects when --force or -y is provided", async ({
			expect,
		}) => {
			let catalogHeaderCount = 0;
			const bulkFile = "bulk.json";

			fs.writeFileSync("file1.txt", "content1");
			fs.writeFileSync("file2.txt", "content2");
			fs.writeFileSync(
				bulkFile,
				JSON.stringify([
					{ key: "key1", file: "file1.txt" },
					{ key: "key2", file: "file2.txt" },
				])
			);

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/objects/*",
					({ request }) => {
						if (request.headers.get("cf-r2-data-catalog-check") === "true") {
							catalogHeaderCount++;
						}
						return HttpResponse.json(createFetchResult({}));
					}
				)
			);

			await runWrangler(
				`r2 bulk put --remote my-bucket --filename ${bulkFile} --force`
			);

			expect(catalogHeaderCount).toBe(0); // No uploads should have header
			await runWrangler(
				`r2 bulk put --remote my-bucket --filename ${bulkFile} -y`
			);

			expect(catalogHeaderCount).toBe(0); // No uploads should have header
		});
		it("should fail bulk operation on first 409 conflict without force", async ({
			expect,
		}) => {
			const bulkFile = "bulk.json";

			fs.writeFileSync("file1.txt", "content1");
			fs.writeFileSync("file2.txt", "content2");
			fs.writeFileSync(
				bulkFile,
				JSON.stringify([
					{ key: "key1", file: "file1.txt" },
					{ key: "key2", file: "file2.txt" },
				])
			);

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/objects/key1",
					() => {
						return new HttpResponse(
							"Data Catalog is enabled for this bucket. This operation could leave your bucket's Data Catalog in an invalid state.",
							{ status: 409, statusText: "Conflict" }
						);
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler(`r2 bulk put --remote my-bucket --filename ${bulkFile}`)
			).rejects.toThrow(/Data catalog validation failed/);
		});
	});
	describe("lifecycle add", () => {
		it("should send catalog check header when force is NOT provided and NOT send header when flags are provided", async ({
			expect,
		}) => {
			let catalogHeaderSent = false;

			msw.use(
				http.get("*/accounts/:accountId/r2/buckets/:bucketName/lifecycle", () =>
					HttpResponse.json(createFetchResult({ rules: [] }))
				),
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
					({ request }) => {
						catalogHeaderSent =
							request.headers.get("cf-r2-data-catalog-check") === "true";
						return HttpResponse.json(createFetchResult({}));
					}
				)
			);

			await runWrangler(
				"r2 bucket lifecycle add my-bucket --name test-rule --expire-days 30 --prefix images/"
			);

			expect(catalogHeaderSent).toBe(true);

			await runWrangler(
				"r2 bucket lifecycle add my-bucket --name test-rule --expire-days 30 --prefix images/ --force"
			);

			expect(catalogHeaderSent).toBe(false);

			await runWrangler(
				"r2 bucket lifecycle add my-bucket --name test-rule --expire-days 30 --prefix images/ -y"
			);

			expect(catalogHeaderSent).toBe(false);
		});
		it("should show helpful error message on 409 catalog conflict", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
					() => HttpResponse.json(createFetchResult({ rules: [] })),
					{ once: true }
				),
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: 10009,
									message:
										"Data Catalog is enabled for this bucket. This operation could leave your bucket's Data Catalog in an invalid state.",
								},
							]),
							{ status: 409 }
						);
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler(
					"r2 bucket lifecycle add my-bucket --name test-rule --expire-days 30 --prefix images/"
				)
			).rejects.toThrow(/Data catalog validation failed/);
		});
	});
	describe("lifecycle set", () => {
		it("should send catalog check header when force is NOT provided and NOT send header when flags are provided", async ({
			expect,
		}) => {
			let catalogHeaderSent = false;
			const lifecycleFile = "lifecycle.json";

			fs.writeFileSync(
				lifecycleFile,
				JSON.stringify({
					rules: [
						{
							id: "rule-1",
							enabled: true,
							conditions: { prefix: "test/" },
							deleteObjectsTransition: {
								condition: { type: "Age", maxAge: 86400 },
							},
						},
					],
				})
			);

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
					({ request }) => {
						catalogHeaderSent =
							request.headers.get("cf-r2-data-catalog-check") === "true";
						return HttpResponse.json(createFetchResult({}));
					}
				)
			);

			await runWrangler(
				`r2 bucket lifecycle set my-bucket --file ${lifecycleFile}`
			);

			expect(catalogHeaderSent).toBe(true);
			await runWrangler(
				`r2 bucket lifecycle set my-bucket --file ${lifecycleFile} --force`
			);

			expect(catalogHeaderSent).toBe(false);
			await runWrangler(
				`r2 bucket lifecycle set my-bucket --file ${lifecycleFile} -y`
			);

			expect(catalogHeaderSent).toBe(false);
		});
		it("should show helpful error message on 409 catalog conflict", async ({
			expect,
		}) => {
			const lifecycleFile = "lifecycle.json";

			fs.writeFileSync(
				lifecycleFile,
				JSON.stringify({
					rules: [
						{
							id: "rule-1",
							enabled: true,
							conditions: { prefix: "test/" },
							deleteObjectsTransition: {
								condition: { type: "Age", maxAge: 86400 },
							},
						},
					],
				})
			);

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: 10009,
									message:
										"Data Catalog is enabled for this bucket. This operation could leave your bucket's Data Catalog in an invalid state.",
								},
							]),
							{ status: 409 }
						);
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler(`r2 bucket lifecycle set my-bucket --file ${lifecycleFile}`)
			).rejects.toThrow(/Data catalog validation failed/);
		});
	});
	describe("lifecycle remove", () => {
		it("should NOT send catalog check header (removes not relevant to catalog)", async ({
			expect,
		}) => {
			let catalogHeaderSent = false;

			msw.use(
				http.get(
					"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
					() =>
						HttpResponse.json(
							createFetchResult({
								rules: [
									{
										id: "test-rule",
										enabled: true,
										conditions: { prefix: "images/" },
										deleteObjectsTransition: {
											condition: { type: "Age", maxAge: 86400 },
										},
									},
								],
							})
						),
					{ once: true }
				),
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
					({ request }) => {
						catalogHeaderSent =
							request.headers.get("cf-r2-data-catalog-check") === "true";
						return HttpResponse.json(createFetchResult({}));
					},
					{ once: true }
				)
			);

			await runWrangler(
				"r2 bucket lifecycle remove my-bucket --name test-rule"
			);

			expect(catalogHeaderSent).toBe(false);
		});
	});
});
