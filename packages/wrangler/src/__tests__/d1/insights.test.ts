import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { getDurationDates } from "../../d1/insights";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { getMswSuccessMembershipHandlers, msw } from "../helpers/msw";
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
		expect(() => getDurationDates("32d")).toThrow(
			`Invalid --time-period value "32d": 32 days exceeds the maximum of 31 days. Provide a value of 31d or less.`
		);
	});
	it("should throw an error if duration is greater than 31 days (in minutes)", ({
		expect,
	}) => {
		expect(() => getDurationDates("44641m")).toThrow(
			`Invalid --time-period value "44641m": 44641 minutes exceeds the maximum of 44640 minutes (31 days). Provide a value of 44640m or less.`
		);
	});

	it("should throw an error if duration is greater than 31 days (in hours)", ({
		expect,
	}) => {
		expect(() => getDurationDates("745h")).toThrow(
			`Invalid --time-period value "745h": 745 hours exceeds the maximum of 744 hours (31 days). Provide a value of 744h or less.`
		);
	});

	it("should throw an error if duration unit is invalid", ({ expect }) => {
		expect(() => getDurationDates("1y")).toThrow(
			`Invalid --time-period unit "y" in "1y". Supported units: d (days), h (hours), m (minutes). Example: --time-period=7d.`
		);
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

	it("should return insights across the account when no database name is given", async ({
		expect,
	}) => {
		setIsTTY(false);
		const databaseLookups: string[] = [];
		let graphqlQuery = "";
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "1701", name: "enterprise" }]),
			http.get("*/accounts/:accountId/d1/database/:id", ({ params }) => {
				databaseLookups.push(String(params.id));
				return HttpResponse.json(
					{ success: false, errors: [{ code: 7404, message: "Not Found" }] },
					{ status: 404 }
				);
			}),
			http.post("*/graphql", async ({ request }) => {
				graphqlQuery = ((await request.json()) as { query: string }).query;
				return HttpResponse.json({
					data: {
						viewer: {
							accounts: [
								{
									d1QueriesAdaptiveGroups: [
										{
											dimensions: {
												query: "SELECT * FROM Orders",
												databaseId: "northwind-uuid",
											},
											sum: {
												queryDurationMs: 300,
												rowsRead: 3000,
												rowsWritten: 0,
												rowsReturned: 30,
											},
											avg: {
												queryDurationMs: 100,
												rowsRead: 1000,
												rowsWritten: 0,
												rowsReturned: 10,
											},
											count: 3,
										},
										{
											dimensions: {
												query: "SELECT * FROM Customers",
												databaseId: "northwind-uuid",
											},
											sum: { rowsRead: 20 },
											count: 2,
										},
										{
											dimensions: {
												query: "SELECT 1",
												databaseId: "other-db-uuid",
											},
											sum: { rowsRead: 1 },
											count: 1,
										},
									],
								},
							],
						},
					},
					errors: null,
				});
			})
		);

		await runWrangler("d1 insights --json");

		expect(graphqlQuery).toContain("orderBy: [sum_queryDurationMs_DESC]");

		expect(databaseLookups).toEqual([]);
		expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
			[
			  {
			    "avgDurationMs": 100,
			    "avgRowsRead": 1000,
			    "avgRowsWritten": 0,
			    "databaseId": "northwind-uuid",
			    "numberOfTimesRun": 3,
			    "query": "SELECT * FROM Orders",
			    "queryEfficiency": 0.01,
			    "totalDurationMs": 300,
			    "totalRowsRead": 3000,
			    "totalRowsWritten": 0,
			  },
			  {
			    "avgDurationMs": 0,
			    "avgRowsRead": 0,
			    "avgRowsWritten": 0,
			    "databaseId": "northwind-uuid",
			    "numberOfTimesRun": 2,
			    "query": "SELECT * FROM Customers",
			    "queryEfficiency": 0,
			    "totalDurationMs": 0,
			    "totalRowsRead": 20,
			    "totalRowsWritten": 0,
			  },
			  {
			    "avgDurationMs": 0,
			    "avgRowsRead": 0,
			    "avgRowsWritten": 0,
			    "databaseId": "other-db-uuid",
			    "numberOfTimesRun": 1,
			    "query": "SELECT 1",
			    "queryEfficiency": 0,
			    "totalDurationMs": 0,
			    "totalRowsRead": 1,
			    "totalRowsWritten": 0,
			  },
			]
		`);
	});

	it("should report a rate limit returned in the errors array of an HTTP 200 response", async ({
		expect,
	}) => {
		setIsTTY(false);
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "1701", name: "enterprise" }]),
			http.post("*/graphql", () =>
				HttpResponse.json({
					data: null,
					errors: [
						{
							message:
								"Rate limiter budget depleted. Please try again after 5 minutes.",
						},
					],
				})
			)
		);

		await expect(() => runWrangler("d1 insights --json")).rejects.toThrow(
			/rate limited the request[\s\S]*The rate limit resets within 5 minutes/
		);
	});

	it("should throw if database doesn't exist", async ({ expect }) => {
		setIsTTY(false);
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "1701", name: "enterprise" }]),
			http.get("*/accounts/:accountId/d1/database/:name", async () => {
				return HttpResponse.json(
					{ success: false, errors: [{ code: 7404, message: "Not Found" }] },
					{ status: 404 }
				);
			})
		);

		await expect(() => runWrangler("d1 insights not-a-db")).rejects.toThrow(
			"Couldn't find a D1 DB with name or binding 'not-a-db' in your config or the API."
		);
	});

	it("should display valid json output", async ({ expect }) => {
		setIsTTY(false);
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
			...getMswSuccessMembershipHandlers([{ id: "1701", name: "enterprise" }]),
			http.get("*/accounts/:accountId/d1/database/:name", async () => {
				return HttpResponse.json({
					result: {
						uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
						name: "northwind",
					},
					success: true,
					errors: [],
					messages: [],
				});
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
		expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
			[
			  {
			    "avgDurationMs": 0,
			    "avgRowsRead": 0,
			    "avgRowsWritten": 0,
			    "numberOfTimesRun": 0,
			    "query": "sample query",
			    "queryEfficiency": 0,
			    "totalDurationMs": 0,
			    "totalRowsRead": 10,
			    "totalRowsWritten": 0,
			  },
			]
		`);
	});
});
