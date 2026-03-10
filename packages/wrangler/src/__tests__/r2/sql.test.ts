import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("r2 sql", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	runInTempDir();

	describe("help", () => {
		it("should show help when no subcommand is passed", async () => {
			await runWrangler("r2 sql");
			await endEventLoop();
			expect(std.out).toContain("wrangler r2 sql");
			expect(std.out).toContain("Send queries and manage R2 SQL");
			expect(std.out).toContain("wrangler r2 sql query <warehouse> <query>");
		});

		it("should show help for query command", async () => {
			await runWrangler("r2 sql query --help");
			await endEventLoop();
			expect(std.out).toContain("Execute SQL query against R2 Data Catalog");
			expect(std.out).toContain("warehouse");
			expect(std.out).toContain("R2 Data Catalog warehouse name");
			expect(std.out).toContain("query");
			expect(std.out).toContain("The SQL query to execute");
		});
	});

	describe("query", () => {
		const mockWarehouse = "account123_mybucket";
		const mockQuery = "SELECT * FROM data";
		const mockToken = "test-token-123";

		beforeEach(() => {
			vi.stubEnv("WRANGLER_R2_SQL_AUTH_TOKEN", mockToken);
		});

		it("should require warehouse and query arguments", async () => {
			await expect(runWrangler("r2 sql query")).rejects.toThrow(
				"Not enough non-option arguments: got 0, need at least 2"
			);

			await expect(runWrangler("r2 sql query testWarehouse")).rejects.toThrow(
				"Not enough non-option arguments: got 1, need at least 2"
			);
		});

		it("should require WRANGLER_R2_SQL_AUTH_TOKEN environment variable", async () => {
			vi.stubEnv("WRANGLER_R2_SQL_AUTH_TOKEN", undefined);
			vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);

			await expect(
				runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
			).rejects.toThrow(
				"Missing WRANGLER_R2_SQL_AUTH_TOKEN environment variable"
			);
		});

		it("should validate warehouse name format", async () => {
			await expect(
				runWrangler(`r2 sql query invalidwarehouse "${mockQuery}"`)
			).rejects.toThrow("Warehouse name has invalid format");
		});

		it("should execute a successful query and display results", async () => {
			const mockResponse = {
				success: true,
				errors: [],
				messages: [],
				result: {
					schema: [
						{ name: "id", type: "Int64" },
						{ name: "name", type: "Utf8" },
						{ name: "age", type: "Int64" },
					],
					rows: [
						{ id: 1, name: "Alice", age: 30 },
						{ id: 2, name: "Bob", age: 25 },
						{ id: 3, name: "Charlie", age: 35 },
					],
					metrics: {
						r2_requests_count: 5,
						files_scanned: 2,
						bytes_scanned: 1024 * 1024,
					},
				},
			};

			msw.use(
				http.post(
					"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName",
					async ({ request, params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("account123");
						expect(bucketName).toEqual("mybucket");

						const body = (await request.json()) as {
							warehouse: string;
							query: string;
						};
						expect(body.warehouse).toEqual(mockWarehouse);
						expect(body.query).toEqual(mockQuery);

						const authHeader = request.headers.get("Authorization");
						expect(authHeader).toEqual(`Bearer ${mockToken}`);

						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);

			// Check that results are displayed in a table format.
			expect(std.out).toContain("id");
			expect(std.out).toContain("name");
			expect(std.out).toContain("age");
			expect(std.out).toContain("Alice");
			expect(std.out).toContain("Bob");
			expect(std.out).toContain("Charlie");
			expect(std.out).toContain("across 2 files from R2");
			// Not checking MB/s speed as it depends on timing.
		});

		it("should handle queries with no results", async () => {
			const mockResponse = {
				success: true,
				errors: [],
				messages: [],
				result: {
					schema: [],
					rows: [],
				},
				metrics: {
					r2_requests_count: 0,
					files_scanned: 0,
					bytes_scanned: 0,
				},
			};

			msw.use(
				http.post(
					"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName",
					async () => {
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
			expect(std.out).toContain("Query executed successfully with no results");
		});

		it("should handle query failures", async () => {
			const mockResponse = {
				success: false,
				errors: [
					{ code: 1001, message: "Syntax error in SQL query" },
					{ code: 1002, message: "Table not found" },
				],
				messages: [],
				result: null,
			};

			msw.use(
				http.post(
					"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName",
					async () => {
						return HttpResponse.json(mockResponse, { status: 500 });
					},
					{ once: true }
				)
			);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
			expect(std.err).toContain(
				"Query failed because of the following errors:"
			);
			expect(std.err).toContain("1001: Syntax error in SQL query");
			expect(std.err).toContain("1002: Table not found");
		});

		it("should handle API connection errors", async () => {
			msw.use(
				http.post(
					"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName",
					async () => {
						return HttpResponse.error();
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
			).rejects.toThrow("Failed to connect to R2 SQL API");
		});

		it("should handle invalid JSON responses", async () => {
			msw.use(
				http.post(
					"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName",
					async () => {
						return HttpResponse.text("Invalid JSON", { status: 200 });
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
			).rejects.toThrow("Received a malformed response from the API");
		});

		it("should handle nested objects (as JSON with null converted to '') in query results", async () => {
			const mockResponse = {
				success: true,
				errors: [],
				messages: [],
				result: {
					request_id: "dqe-prod-test",
					schema: [
						{
							name: "approx_top_k(value, Int64(3))",
							descriptor: {
								type: {
									name: "list",
									item: {
										type: {
											name: "struct",
											fields: [
												{
													type: { name: "int64" },
													nullable: true,
													name: "value",
												},
												{
													type: { name: "uint64" },
													nullable: false,
													name: "count",
												},
											],
										},
										nullable: true,
									},
								},
								nullable: true,
							},
						},
					],
					rows: [
						{
							"approx_top_k(value, Int64(3))": [
								{ value: 0, count: 961 },
								{ value: 1, count: 485 },
								{ value: 2, count: null },
							],
						},
					],
					metrics: {
						r2_requests_count: 6,
						files_scanned: 3,
						bytes_scanned: 62878,
					},
				},
			};

			msw.use(
				http.post(
					"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName",
					async () => {
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);

			const startOfTable = std.out.indexOf("┌");
			const endOfTable = std.out.indexOf("┘") + 1;

			expect(std.out.slice(startOfTable, endOfTable)).toMatchInlineSnapshot(`
				"┌─┐
				│ approx_top_k(value, Int64(3)) │
				├─┤
				│ [{"value":0,"count":961},{"value":1,"count":485},{"value":2,"count":""}] │
				└─┘"
			`);
		});

		it("should handle null values in query results", async () => {
			const mockResponse = {
				success: true,
				errors: [],
				messages: [],
				result: {
					schema: [
						{ name: "id", type: "Int64" },
						{ name: "name", type: "Utf8" },
						{ name: "email", type: "Utf8" },
					],
					rows: [
						{ id: 1, name: "Alice", email: null },
						{ id: 2, name: null, email: "bob@example.com" },
					],
					metrics: {
						r2_requests_count: 5,
						files_scanned: 2,
						bytes_scanned: 1024 * 1024,
					},
				},
			};

			msw.use(
				http.post(
					"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName",
					async () => {
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
			// The output should handle null values gracefully (displayed as empty strings).
			expect(std.out).toContain("Alice");
			expect(std.out).toContain("bob@example.com");
		});
	});
});
