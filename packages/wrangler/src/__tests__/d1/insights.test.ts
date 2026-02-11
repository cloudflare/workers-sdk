import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { getDurationDates } from "../../d1/insights";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("getDurationDates()", () => {
	beforeAll(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		//lock time to 2023-08-01 UTC
		vi.setSystemTime(new Date(2023, 7, 1));
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it("should throw an error if duration is greater than 31 days (in days)", ({
		expect,
	}) => {
		expect(() => getDurationDates("32d")).toThrowError(
			"Duration cannot be greater than 31 days"
		);
	});
	it("should throw an error if duration is greater than 31 days (in minutes)", ({
		expect,
	}) => {
		expect(() => getDurationDates("44641m")).toThrowError(
			"Duration cannot be greater than 44640 minutes (31 days)"
		);
	});

	it("should throw an error if duration is greater than 31 days (in hours)", ({
		expect,
	}) => {
		expect(() => getDurationDates("745h")).toThrowError(
			"Duration cannot be greater than 744 hours (31 days)"
		);
	});

	it("should throw an error if duration unit is invalid", ({ expect }) => {
		expect(() => getDurationDates("1y")).toThrowError("Invalid duration unit");
	});

	it("should return the correct start and end dates", ({ expect }) => {
		const [startDate, endDate] = getDurationDates("5d");

		expect(+new Date(startDate)).toBe(+new Date(2023, 6, 27));
		expect(+new Date(endDate)).toBe(+new Date(2023, 7, 1));
	});
});

describe("insights", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	mockConsoleMethods();
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	it("should throw if a database name is not provided", async ({ expect }) => {
		await expect(() => runWrangler("d1 insights")).rejects.toThrow(
			"Not enough non-option arguments: got 0, need at least 1"
		);

		expect(std.err).toMatchInlineSnapshot(`
    "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

    "
  `);
	});

	it("should throw if database doesn't exist", async ({ expect }) => {
		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		msw.use(
			http.get("*/accounts/:accountId/d1/database", async () => {
				return HttpResponse.json(
					{
						result: [
							{
								created_at: "2022-11-15T18:25:44.442097Z",
								name: "my-database",
								uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
								version: "production",
							},
						],
						success: true,
						result_info: {
							count: 1,
							page: 1,
							per_page: 10,
							total_count: 1,
						},
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);

		await expect(() => runWrangler("d1 insights not-a-db")).rejects.toThrow(
			"Couldn't find DB with name 'not-a-db'"
		);
	});

	it("should display the expected output", async ({ expect }) => {
		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		writeWranglerConfig({
			d1_databases: [
				{
					binding: "DB",
					database_name: "northwind",
					database_id: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
				},
			],
		});
		msw.use(
			http.get("*/accounts/:accountId/d1/database", async () => {
				return HttpResponse.json(
					{
						result: [
							{
								created_at: "2022-11-15T18:25:44.442097Z",
								name: "my-database",
								uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
								version: "production",
							},
						],
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		msw.use(
			http.get("*/accounts/:accountId/d1/database/*", async () => {
				return HttpResponse.json(
					{
						result: [
							{
								uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
								name: "northwind",
								created_at: "2023-05-23T08:33:54.590Z",
								version: "beta",
								num_tables: 13,
								file_size: 33067008,
								running_in_region: "WEUR",
							},
						],
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		msw.use(
			http.post("*/graphql", async () => {
				return HttpResponse.json(
					{
						data: {
							viewer: {
								accounts: [
									{
										d1QueriesAdaptiveGroups: [
											{
												dimensions: {
													query: "sample query",
												},
												sum: {
													rowsRead: 10,
												},
											},
										],
									},
								],
							},
						},
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		await runWrangler("d1 insights my-database --json");
		expect(std.out).toMatchInlineSnapshot(`
			"[
			  {
			    "query": "sample query",
			    "avgRowsRead": 0,
			    "totalRowsRead": 10,
			    "avgRowsWritten": 0,
			    "totalRowsWritten": 0,
			    "avgDurationMs": 0,
			    "totalDurationMs": 0,
			    "numberOfTimesRun": 0,
			    "queryEfficiency": 0
			  }
			]"
		`);
	});
});
