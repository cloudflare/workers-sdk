import { http, HttpResponse } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("r2 sql", () => {
	const std = mockConsoleMethods();
	const originalEnv = process.env;
	mockAccountId();
	mockApiToken();

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	runInTempDir();

	describe("help", () => {
		it("should show help when no subcommand is passed", async () => {
			await runWrangler("r2 sql");
			await endEventLoop();
			expect(std.out).toContain("wrangler r2 sql");
			expect(std.out).toContain("Send queries and manage R2 SQL");
			expect(std.out).toContain("wrangler r2 sql enable");
			expect(std.out).toContain("wrangler r2 sql disable");
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

	describe("enable", () => {
		it("should enable R2 SQL for an account", async () => {
			msw.use(
				http.post(
					"*/accounts/:accountId/dqe/enable",
					async ({ params }) => {
						const { accountId } = params;
						expect(accountId).toEqual("some-account-id");
						return HttpResponse.json(createFetchResult({}));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 sql enable");
			expect(std.out).toContain("Enabling R2 SQL for your account...");
			expect(std.out).toContain("✅ R2 SQL is enabled for your account");
			expect(std.out).toContain(
				"Try sending a query with `wrangler r2 sql query <warehouse name> <SQL query>`"
			);
		});

		it("should handle enable errors", async () => {
			msw.use(
				http.post(
					"*/accounts/:accountId/dqe/enable",
					async () => {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 10001, message: "Authorization error" }],
								messages: [],
								result: null,
							},
							{ status: 403 }
						);
					},
					{ once: true }
				)
			);

			await expect(runWrangler("r2 sql enable")).rejects.toThrow(
				"Failed to enable R2 SQL"
			);
		});
	});

	describe("disable", () => {
		it("should disable R2 SQL for an account", async () => {
			msw.use(
				http.post(
					"*/accounts/:accountId/dqe/disable",
					async ({ params }) => {
						const { accountId } = params;
						expect(accountId).toEqual("some-account-id");
						return HttpResponse.json(createFetchResult({}));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 sql disable");
			expect(std.out).toContain("Disabling R2 SQL for your account...");
			expect(std.out).toContain("✅ R2 SQL is disabled for your account");
		});

		it("should handle disable errors", async () => {
			msw.use(
				http.post(
					"*/accounts/:accountId/dqe/disable",
					async () => {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 10001, message: "Authorization error" }],
								messages: [],
								result: null,
							},
							{ status: 403 }
						);
					},
					{ once: true }
				)
			);

			await expect(runWrangler("r2 sql disable")).rejects.toThrow(
				"Failed to disable R2 SQL"
			);
		});
	});

	describe("query", () => {
		const mockWarehouse = "account123_mybucket";
		const mockQuery = "SELECT * FROM data";
		const mockToken = "test-token-123";

		beforeEach(() => {
			process.env.CLOUDFLARE_R2_SQL_TOKEN = mockToken;
		});

		it("should require warehouse and query arguments", async () => {
			await expect(runWrangler("r2 sql query")).rejects.toThrow(
				"Not enough non-option arguments: got 0, need at least 2"
			);

			await expect(runWrangler("r2 sql query testWarehouse")).rejects.toThrow(
				"Not enough non-option arguments: got 1, need at least 2"
			);
		});

		it("should require CLOUDFLARE_R2_SQL_TOKEN environment variable", async () => {
			delete process.env.CLOUDFLARE_R2_SQL_TOKEN;

			await expect(
				runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
			).rejects.toThrow(
				"CLOUDFLARE_R2_SQL_TOKEN environment variable is not set"
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
					column_order: ["id", "name", "age"],
					rows: [
						{ id: 1, name: "Alice", age: 30 },
						{ id: 2, name: "Bob", age: 25 },
						{ id: 3, name: "Charlie", age: 35 },
					],
					stats: {
						total_r2_requests: 5,
						total_r2_bytes_read: 1024 * 1024,
						total_r2_bytes_written: 0,
						total_bytes_matched: 512,
						total_rows_skipped: 0,
						total_files_scanned: 2,
					},
				},
			};

			// Mock the fetch call to the SQL API.
			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: async () => JSON.stringify(mockResponse),
			});

			try {
				await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);

				// Verify the fetch was called with correct parameters.
				expect(global.fetch).toHaveBeenCalledWith(
					"https://api.dqe.cloudflarestorage.com/api/v1/accounts/account123/dqe/query/mybucket",
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${mockToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							warehouse: mockWarehouse,
							query: mockQuery,
						}),
					}
				);

				// Check that results are displayed in a table format.
				expect(std.out).toContain("id");
				expect(std.out).toContain("name");
				expect(std.out).toContain("age");
				expect(std.out).toContain("Alice");
				expect(std.out).toContain("Bob");
				expect(std.out).toContain("Charlie");
				expect(std.out).toContain("across 2 files from R2");
				// Not checking MB/s speed as it depends on timing.
			} finally {
				global.fetch = originalFetch;
			}
		});

		it("should handle queries with no results", async () => {
			const mockResponse = {
				success: true,
				errors: [],
				messages: [],
				result: {
					column_order: [],
					rows: [],
				},
			};

			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: async () => JSON.stringify(mockResponse),
			});

			try {
				await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
				expect(std.out).toContain(
					"Query executed successfully with no results"
				);
			} finally {
				global.fetch = originalFetch;
			}
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

			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: async () => JSON.stringify(mockResponse),
			});

			try {
				await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
				expect(std.err).toContain(
					"Query failed because of the following errors:"
				);
				expect(std.err).toContain("1001: Syntax error in SQL query");
				expect(std.err).toContain("1002: Table not found");
			} finally {
				global.fetch = originalFetch;
			}
		});

		it("should handle API connection errors", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			try {
				await expect(
					runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
				).rejects.toThrow("Failed to connect to R2 SQL API: Network error");
			} finally {
				global.fetch = originalFetch;
			}
		});

		it("should handle non-200 HTTP responses", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockResolvedValue({
				status: 500,
				text: async () => "Internal server error",
			});

			try {
				await expect(
					runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
				).rejects.toThrow("Query failed with HTTP 500: Internal server error");
			} finally {
				global.fetch = originalFetch;
			}
		});

		it("should handle invalid JSON responses", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: async () => "Invalid JSON",
			});

			try {
				await expect(
					runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`)
				).rejects.toThrow(
					"Internal error, API response format is invalid: Invalid JSON"
				);
			} finally {
				global.fetch = originalFetch;
			}
		});

		it("should handle null values in query results", async () => {
			const mockResponse = {
				success: true,
				errors: [],
				messages: [],
				result: {
					column_order: ["id", "name", "email"],
					rows: [
						{ id: 1, name: "Alice", email: null },
						{ id: 2, name: null, email: "bob@example.com" },
					],
				},
			};

			const originalFetch = global.fetch;
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: async () => JSON.stringify(mockResponse),
			});

			try {
				await runWrangler(`r2 sql query ${mockWarehouse} "${mockQuery}"`);
				// The output should handle null values gracefully (displayed as empty strings).
				expect(std.out).toContain("Alice");
				expect(std.out).toContain("bob@example.com");
			} finally {
				global.fetch = originalFetch;
			}
		});
	});
});
