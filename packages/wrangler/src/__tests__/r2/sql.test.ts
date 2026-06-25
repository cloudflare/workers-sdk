import { writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

describe("r2 sql", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	runInTempDir();

	describe("help", () => {
		it("should show help when no subcommand is passed", async ({ expect }) => {
			await runWrangler("r2 sql");
			await endEventLoop();
			expect(std.out).toContain("wrangler r2 sql");
			expect(std.out).toContain("Send queries and manage R2 SQL");
		});

		it("should show help for query command", async ({ expect }) => {
			await runWrangler("r2 sql query --help");
			await endEventLoop();
			expect(std.out).toContain("Execute SQL query against R2 Data Catalog");
			expect(std.out).toContain("warehouse");
			expect(std.out).toContain("R2 Data Catalog warehouse name");
			expect(std.out).toContain("query");
			expect(std.out).toContain("The SQL query to execute");
			expect(std.out).toContain("--sql-file");
			expect(std.out).toContain("A .sql file to execute");
			expect(std.out).toContain("--json");
			expect(std.out).toContain("--csv");
		});
	});

	describe("query", () => {
		const mockWarehouse = "account123_mybucket";
		const mockQuery = "SELECT * FROM data";
		const mockToken = "test-token-123";
		const API_URL =
			"https://api.sql.cloudflarestorage.com/api/v1/accounts/:accountId/r2-sql/query/:bucketName";

		function mockSqlResponse(response: object, status = 200) {
			msw.use(
				http.post(
					API_URL,
					async () => {
						return HttpResponse.json(response, { status });
					},
					{ once: true }
				)
			);
		}

		const successResponse = {
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

		beforeEach(() => {
			vi.stubEnv("WRANGLER_R2_SQL_AUTH_TOKEN", mockToken);
		});

		it("should require warehouse argument", async ({ expect }) => {
			await expect(runWrangler("r2 sql query")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});

		it("should require either query argument or --sql-file", async ({
			expect,
		}) => {
			await expect(
				runWrangler(`r2 sql query ${mockWarehouse}`)
			).rejects.toThrow(
				"Must provide a SQL query as an argument or via --sql-file."
			);
		});

		it("should reject both query argument and --sql-file", async ({
			expect,
		}) => {
			writeFileSync("test.sql", mockQuery);
			await expect(
				runWrangler(
					`r2 sql query ${mockWarehouse} "${mockQuery}" --sql-file test.sql`
				)
			).rejects.toThrow(
				"Cannot provide both a query argument and --sql-file flag."
			);
		});

		it("should reject both --json and --csv", async ({ expect }) => {
			mockSqlResponse(successResponse);
			await expect(
				runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}" --json --csv`)
			).rejects.toThrow(
				"Cannot use both --json and --csv flags at the same time."
			);
		});

		it("should require WRANGLER_R2_SQL_AUTH_TOKEN environment variable", async ({
			expect,
		}) => {
			// Use delete directly because vi.stubEnv(name, undefined) doesn't
			// propagate through Vitest 4's env proxy deleteProperty handler.
			delete process.env.WRANGLER_R2_SQL_AUTH_TOKEN;
			delete process.env.CLOUDFLARE_API_TOKEN;

			await expect(
				runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
			).rejects.toThrow(
				"Missing WRANGLER_R2_SQL_AUTH_TOKEN environment variable"
			);
		});

		it("should validate warehouse name format", async ({ expect }) => {
			await expect(
				runWrangler(`r2 sql query invalidwarehouse "${mockQuery}"`)
			).rejects.toThrow("Warehouse name has invalid format");
		});

		it("should execute a successful query and display results", async ({
			expect,
		}) => {
			msw.use(
				http.post(
					API_URL,
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

						return HttpResponse.json(successResponse);
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
			expect(std.out).toContain("across 2 files");
			expect(std.out).toContain("5 R2 requests");
		});

		it("should handle queries with no results", async ({ expect }) => {
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

			mockSqlResponse(mockResponse);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
			expect(std.out).toContain("Query executed successfully with no results");
		});

		it("should handle query failures", async ({ expect }) => {
			const mockResponse = {
				success: false,
				errors: [
					{ code: 1001, message: "Syntax error in SQL query" },
					{ code: 1002, message: "Table not found" },
				],
				messages: [],
				result: null,
			};

			mockSqlResponse(mockResponse, 500);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
			expect(std.err).toContain(
				"Query failed because of the following errors:"
			);
			expect(std.err).toContain("1001: Syntax error in SQL query");
			expect(std.err).toContain("1002: Table not found");
		});

		it("should handle API connection errors", async ({ expect }) => {
			msw.use(
				http.post(
					API_URL,
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

		it("should handle invalid JSON responses", async ({ expect }) => {
			msw.use(
				http.post(
					API_URL,
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

		it("should handle nested objects (as JSON with null converted to '') in query results", async ({
			expect,
		}) => {
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

			mockSqlResponse(mockResponse);

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

		it("should handle null values in query results", async ({ expect }) => {
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

			mockSqlResponse(mockResponse);

			await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
			// The output should handle null values gracefully (displayed as empty strings).
			expect(std.out).toContain("Alice");
			expect(std.out).toContain("bob@example.com");
		});

		describe("--json output", () => {
			it("should output results as JSON", async ({ expect }) => {
				mockSqlResponse(successResponse);

				await runWrangler(
					`r2 sql query ${mockWarehouse} "${mockQuery}" --json`
				);

				const parsed = JSON.parse(std.out);
				expect(parsed).toEqual(successResponse.result.rows);
			});

			it("should output empty array for no results", async ({ expect }) => {
				mockSqlResponse({
					success: true,
					errors: [],
					messages: [],
					result: { schema: [], rows: [], metrics: {} },
				});

				await runWrangler(
					`r2 sql query ${mockWarehouse} "${mockQuery}" --json`
				);

				const parsed = JSON.parse(std.out);
				expect(parsed).toEqual([]);
			});

			it("should output error as JSON on failure", async ({ expect }) => {
				const errorResponse = {
					success: false,
					errors: [{ code: 1001, message: "Bad query" }],
					messages: [],
					result: null,
				};
				mockSqlResponse(errorResponse, 400);

				await runWrangler(
					`r2 sql query ${mockWarehouse} "${mockQuery}" --json`
				);

				const parsed = JSON.parse(std.out);
				expect(parsed.success).toBe(false);
				expect(parsed.errors[0].code).toBe(1001);
			});
		});

		describe("--csv output", () => {
			it("should output results as CSV", async ({ expect }) => {
				mockSqlResponse(successResponse);

				await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}" --csv`);

				const lines = std.out.trim().split("\n");
				expect(lines[0]).toBe("id,name,age");
				expect(lines[1]).toBe("1,Alice,30");
				expect(lines[2]).toBe("2,Bob,25");
				expect(lines[3]).toBe("3,Charlie,35");
			});

			it("should escape CSV fields with commas and quotes", async ({
				expect,
			}) => {
				mockSqlResponse({
					success: true,
					errors: [],
					messages: [],
					result: {
						schema: [
							{ name: "name", type: "Utf8" },
							{ name: "description", type: "Utf8" },
						],
						rows: [
							{
								name: 'O"Brien',
								description: "has, commas",
							},
						],
						metrics: {
							r2_requests_count: 1,
							files_scanned: 1,
							bytes_scanned: 100,
						},
					},
				});

				await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}" --csv`);

				const lines = std.out.trim().split("\n");
				expect(lines[0]).toBe("name,description");
				expect(lines[1]).toBe('"O""Brien","has, commas"');
			});
		});

		describe("--sql-file flag", () => {
			it("should read query from a .sql file", async ({ expect }) => {
				const fileQuery = "SELECT id, name FROM users LIMIT 5";
				writeFileSync("query.sql", fileQuery);

				msw.use(
					http.post(
						API_URL,
						async ({ request }) => {
							const body = (await request.json()) as { query: string };
							expect(body.query).toEqual(fileQuery);
							return HttpResponse.json(successResponse);
						},
						{ once: true }
					)
				);

				await runWrangler(`r2 sql query ${mockWarehouse} --sql-file query.sql`);

				expect(std.out).toContain("Alice");
			});
		});

		describe("EXPLAIN formatting", () => {
			it("should render plain EXPLAIN in table format", async ({ expect }) => {
				const explainResponse = {
					success: true,
					errors: [],
					messages: [],
					result: {
						schema: [{ name: "plan", type: "Utf8" }],
						rows: [
							{ plan: "IcebergScan: table=data" },
							{ plan: "  Projection: id, name" },
						],
						metrics: {
							r2_requests_count: 1,
							files_scanned: 0,
							bytes_scanned: 0,
						},
					},
				};

				mockSqlResponse(explainResponse);

				await runWrangler(
					`r2 sql query ${mockWarehouse} "EXPLAIN SELECT id, name FROM data"`
				);

				expect(std.out).toContain("IcebergScan: table=data");
				expect(std.out).toContain("Projection: id, name");
				// Plain EXPLAIN uses the standard table view
				expect(std.out).toContain("┌");
			});

			it("should pretty-print EXPLAIN FORMAT JSON output", async ({
				expect,
			}) => {
				const jsonPlan = {
					type: "IcebergScan",
					table: "data",
					filters: ["id > 10"],
				};
				const explainJsonResponse = {
					success: true,
					errors: [],
					messages: [],
					result: {
						schema: [{ name: "plan", type: "Utf8" }],
						rows: [{ plan: jsonPlan }],
						metrics: {
							r2_requests_count: 1,
							files_scanned: 0,
							bytes_scanned: 0,
						},
					},
				};

				mockSqlResponse(explainJsonResponse);

				await runWrangler(
					`r2 sql query ${mockWarehouse} "EXPLAIN FORMAT JSON SELECT * FROM data"`
				);

				// Should be pretty-printed JSON
				expect(std.out).toContain('"type": "IcebergScan"');
				expect(std.out).toContain('"table": "data"');
			});
		});

		describe("metrics display", () => {
			it("should display r2_requests_count in metrics", async ({ expect }) => {
				mockSqlResponse(successResponse);

				await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);

				expect(std.out).toContain("5 R2 requests");
			});
		});
	});
});
