import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	zCloudflareD1ListDatabasesResponse,
	zCloudflareD1RawDatabaseQueryResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import { disposeWithRetry } from "../../test-shared";
import { expectValidResponse } from "./helpers";

const BASE_URL = "http://localhost/cdn-cgi/explorer/api";

describe("D1 API", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			compatibilityDate: "2026-01-01",
			d1Databases: {
				TEST_DB: "test-db-id",
				ANOTHER_DB: "another-db-id",
			},
			inspectorPort: 0,
			modules: true,
			script: `export default { fetch() { return new Response("user worker"); } }`,
			unsafeLocalExplorer: true,
		});

		// Create a test table in the `TEST_DB`
		const db = await mf.getD1Database("TEST_DB");
		await db
			.prepare(
				`CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	email TEXT NOT NULL
)`
			)
			.run();
		await db
			.prepare(
				`
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');
`
			)
			.run();
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /d1/database", () => {
		test("lists available D1 databases with default pagination", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(`${BASE_URL}/d1/database`);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1ListDatabasesResponse
			);

			expect(data.success).toBe(true);
			expect(data.result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ uuid: "test-db-id", name: "TEST_DB" }),
					expect.objectContaining({
						uuid: "another-db-id",
						name: "ANOTHER_DB",
					}),
				])
			);
			expect(data.result_info).toMatchObject({
				count: 2,
				page: 1,
				per_page: 1000,
				total_count: 2,
			});
		});

		test("pagination works", async ({ expect }) => {
			// D1 has per_page minimum of 10, so use 10 as smallest page size
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database?per_page=10&page=1`
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1ListDatabasesResponse
			);

			expect(data).toMatchObject({
				result_info: {
					count: 2,
					page: 1,
					per_page: 10,
					total_count: 2,
				},
				success: true,
			});
		});

		test("name filter works", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database?name=TEST`
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1ListDatabasesResponse
			);

			expect(data).toMatchObject({
				result: [expect.objectContaining({ uuid: "test-db-id" })],
				result_info: {
					count: 1,
					total_count: 2,
				},
				success: true,
			});
		});

		test("returns empty result for page beyond total", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database?page=100`
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1ListDatabasesResponse
			);

			expect(data).toMatchObject({
				result: [],
				result_info: {
					count: 0,
					page: 100,
					total_count: 2,
				},
				success: true,
			});
		});
	});

	describe("POST /d1/database/:database_id/raw", () => {
		test("returns results as arrays with column names", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database/test-db-id/raw`,
				{
					body: JSON.stringify({
						sql: "SELECT id, name FROM users WHERE id = 1",
					}),
					headers: {
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1RawDatabaseQueryResponse
			);

			expect(data.success).toBe(true);
			expect(data.result).toHaveLength(1);
			expect(data.result?.[0]).toMatchObject({
				results: {
					columns: ["id", "name"],
					rows: [[1, "Alice"]],
				},
				success: true,
			});
		});

		test("handles query with parameters", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database/test-db-id/raw`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						sql: "SELECT name, email FROM users WHERE name = ?",
						params: ["Bob"],
					}),
				}
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1RawDatabaseQueryResponse
			);

			expect(data).toMatchObject({
				result: [
					{
						results: {
							columns: ["name", "email"],
							rows: [["Bob", "bob@example.com"]],
						},
						success: true,
					},
				],
				success: true,
			});
		});

		test("handles batch queries", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database/test-db-id/raw`,
				{
					body: JSON.stringify({
						batch: [
							{ sql: "SELECT id FROM users WHERE id = 1" },
							{ sql: "SELECT name FROM users WHERE id = 2" },
						],
					}),
					headers: {
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1RawDatabaseQueryResponse
			);

			expect(data).toMatchObject({
				result: [
					{
						results: {
							columns: ["id"],
							rows: [[1]],
						},
						success: true,
					},
					{
						results: {
							columns: ["name"],
							rows: [["Bob"]],
						},
						success: true,
					},
				],
				success: true,
			});
		});

		test("returns 404 for non-existent database", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database/non-existent-id/raw`,
				{
					body: JSON.stringify({
						sql: "SELECT 1",
					}),
					headers: {
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1RawDatabaseQueryResponse,
				404
			);

			expect(data).toMatchObject({
				errors: [expect.objectContaining({ message: "Database not found" })],
				success: false,
			});
		});

		test("returns error for invalid SQL", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database/test-db-id/raw`,
				{
					body: JSON.stringify({
						sql: "INVALID SQL STATEMENT",
					}),
					headers: {
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1RawDatabaseQueryResponse,
				500
			);

			expect(data).toMatchObject({
				errors: [expect.objectContaining({ code: 10001 })],
				success: false,
			});
		});
	});

	describe("validation", () => {
		test("returns 400 for invalid query parameters", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database?page=invalid`
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1ListDatabasesResponse,
				400
			);

			expect(data).toMatchObject({
				errors: [
					expect.objectContaining({
						code: 10001,
						message: expect.stringContaining("page"),
					}),
				],
				success: false,
			});
		});

		test("returns 400 for invalid batch item", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database/test-db-id/raw`,
				{
					body: JSON.stringify({
						batch: [{ sql: 123 }], // sql in batch should be a string
					}),
					headers: {
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1RawDatabaseQueryResponse,
				400
			);

			expect(data).toMatchObject({
				errors: [expect.objectContaining({ code: 10001 })],
				success: false,
			});
		});

		test("returns 400 for empty object body", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/d1/database/test-db-id/raw`,
				{
					body: JSON.stringify({}),
					headers: {
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			);

			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await expectValidResponse(
				response,
				zCloudflareD1RawDatabaseQueryResponse,
				400
			);

			expect(data).toMatchObject({
				errors: [
					expect.objectContaining({
						code: 10001,
						message: "Invalid input",
					}),
				],
				success: false,
			});
		});
	});
});
