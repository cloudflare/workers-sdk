import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler analytics-engine", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	runInTempDir();

	describe("help", () => {
		it("should show help when no subcommand is passed", async () => {
			await runWrangler("analytics-engine");
			await endEventLoop();
			expect(std.out).toContain("wrangler analytics-engine");
			expect(std.out).toContain("Query Workers Analytics Engine datasets");
			expect(std.out).toContain("wrangler analytics-engine run [query]");
		});

		it("should show help for run command", async () => {
			await runWrangler("analytics-engine run --help");
			await endEventLoop();
			expect(std.out).toContain(
				"Run a SQL query against your Analytics Engine datasets"
			);
			expect(std.out).toContain("query");
			expect(std.out).toContain("The SQL query to execute");
			expect(std.out).toContain("--file");
			expect(std.out).toContain("--format");
		});

		it("should work with ae alias", async () => {
			await runWrangler("ae");
			await endEventLoop();
			expect(std.out).toContain("wrangler ae");
			expect(std.out).toContain("wrangler ae run [query]");
		});
	});

	describe("run", () => {
		const { setIsTTY } = useMockIsTTY();

		it("should require either query or --file", async () => {
			setIsTTY(false);
			await expect(runWrangler("analytics-engine run")).rejects.toThrowError(
				"Must specify either a query or a file containing a query."
			);
		});

		it("should not allow both query and --file", async () => {
			setIsTTY(false);
			writeFileSync("query.sql", "SELECT 1");
			await expect(
				runWrangler('analytics-engine run "SELECT 1" --file=query.sql')
			).rejects.toThrowError(
				"Cannot specify both a query and a file. Please use one or the other."
			);
		});

		it("should execute query and display table results", async () => {
			setIsTTY(true);
			const mockResponse = {
				data: [
					{ message: "Hello", count: 42 },
					{ message: "World", count: 100 },
				],
				meta: [
					{ name: "message", type: "String" },
					{ name: "count", type: "UInt64" },
				],
			};

			msw.use(
				http.post(
					"*/accounts/:accountId/analytics_engine/sql",
					async ({ request }) => {
						const body = await request.text();
						expect(body).toBe("SELECT * FROM my_dataset");
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(
				'analytics-engine run "SELECT * FROM my_dataset" --format=table'
			);

			expect(std.out).toContain("message");
			expect(std.out).toContain("count");
			expect(std.out).toContain("Hello");
			expect(std.out).toContain("World");
			expect(std.out).toContain("42");
			expect(std.out).toContain("100");
		});

		it("should execute query and display JSON results with --format=json", async () => {
			setIsTTY(false);
			const mockResponse = {
				data: [{ message: "Hello Analytics Engine" }],
				meta: [{ name: "message", type: "String" }],
			};

			msw.use(
				http.post(
					"*/accounts/:accountId/analytics_engine/sql",
					async () => {
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(
				"analytics-engine run \"SELECT 'Hello Analytics Engine' AS message\" --format=json"
			);

			const output = JSON.parse(std.out);
			expect(output).toEqual(mockResponse);
		});

		it("should read query from file with --file", async () => {
			setIsTTY(false);
			const query =
				"SELECT * FROM temperatures WHERE timestamp > NOW() - INTERVAL '1' DAY";
			writeFileSync("query.sql", query);

			const mockResponse = {
				data: [{ temp: 72.5 }],
				meta: [{ name: "temp", type: "Float64" }],
			};

			msw.use(
				http.post(
					"*/accounts/:accountId/analytics_engine/sql",
					async ({ request }) => {
						const body = await request.text();
						expect(body).toBe(query);
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler("analytics-engine run --file=query.sql --format=json");

			const output = JSON.parse(std.out);
			expect(output).toEqual(mockResponse);
		});

		it("should handle empty results", async () => {
			setIsTTY(true);
			const mockResponse = {
				data: [],
				meta: [{ name: "message", type: "String" }],
			};

			msw.use(
				http.post(
					"*/accounts/:accountId/analytics_engine/sql",
					async () => {
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(
				'analytics-engine run "SELECT * FROM empty_table" --format=table'
			);

			expect(std.out).toContain("Query executed successfully with no results.");
		});

		it("should handle API errors gracefully", async () => {
			setIsTTY(false);
			msw.use(
				http.post(
					"*/accounts/:accountId/analytics_engine/sql",
					async () => {
						return HttpResponse.json(
							{ error: "Syntax error in SQL query" },
							{ status: 400 }
						);
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler('analytics-engine run "INVALID SQL" --format=json')
			).rejects.toThrowError("Analytics Engine API error");
		});

		it("should pass through non-JSON responses for FORMAT TabSeparated", async () => {
			setIsTTY(true);
			const tsvResponse = "message\tcount\nHello\t42\nWorld\t100";

			msw.use(
				http.post(
					"*/accounts/:accountId/analytics_engine/sql",
					async () => {
						return HttpResponse.text(tsvResponse);
					},
					{ once: true }
				)
			);

			await runWrangler(
				'analytics-engine run "SELECT * FROM my_dataset FORMAT TabSeparated" --format=table'
			);

			expect(std.out).toContain("message\tcount");
			expect(std.out).toContain("Hello\t42");
		});

		it("should use ae alias for run command", async () => {
			setIsTTY(false);
			const mockResponse = {
				data: [{ result: 1 }],
				meta: [{ name: "result", type: "UInt8" }],
			};

			msw.use(
				http.post(
					"*/accounts/:accountId/analytics_engine/sql",
					async () => {
						return HttpResponse.json(mockResponse);
					},
					{ once: true }
				)
			);

			await runWrangler('ae run "SELECT 1 AS result" --format=json');

			const output = JSON.parse(std.out);
			expect(output).toEqual(mockResponse);
		});
	});
});
