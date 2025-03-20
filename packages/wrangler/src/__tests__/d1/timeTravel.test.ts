import { http, HttpResponse } from "msw";
import { throwIfDatabaseIsAlpha } from "../../d1/timeTravel/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";

// we want to include the banner to make sure it doesn't show up in the output when
// when --json=true
vi.unmock("../../wrangler-banner");

describe("time-travel", () => {
	const std = mockConsoleMethods();
	mockAccountId({ accountId: null });
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	describe("restore", () => {
		it("should reject the use of --timestamp with --bookmark", async () => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});

			await expect(
				runWrangler(
					"d1 time-travel restore db --timestamp=1234 --bookmark=5678"
				)
			).rejects.toThrowError(
				`Provide either a timestamp, or a bookmark - not both.`
			);
		});
	});

	describe("throwIfDatabaseIsAlpha", () => {
		it("should throw for alpha dbs", async () => {
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			mockGetMemberships([
				{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
			]);
			msw.use(
				http.get("*/accounts/:accountId/d1/database/*", async () => {
					return HttpResponse.json(
						{
							result: {
								uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
								name: "northwind",
								created_at: "2023-05-23T08:33:54.590Z",
								version: "alpha",
								num_tables: 13,
								file_size: 33067008,
								running_in_region: "WEUR",
							},
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				})
			);
			await expect(
				throwIfDatabaseIsAlpha("1701", "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06")
			).rejects.toThrowError(
				"Time travel is not available for alpha D1 databases. You will need to migrate to a new database for access to this feature."
			);
		});
		it("should not throw for non-alpha dbs", async () => {
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			mockGetMemberships([
				{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
			]);
			msw.use(
				http.get("*/accounts/:accountId/d1/database/*", async () => {
					return HttpResponse.json(
						{
							result: {
								uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
								name: "northwind",
								created_at: "2023-05-23T08:33:54.590Z",
								version: "production",
								num_tables: 13,
								file_size: 33067008,
								running_in_region: "WEUR",
							},
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				})
			);
			const result = await throwIfDatabaseIsAlpha(
				"1701",
				"d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06"
			);
			//since the function throws if the db is alpha
			expect(result).toBeUndefined();
		});
	});

	describe("--json", () => {
		beforeEach(() => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			mockGetMemberships([
				{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
			]);
			msw.use(
				http.get("*/accounts/:accountId/d1/database/*", async () => {
					return HttpResponse.json(
						{
							result: {
								uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
								name: "db",
								created_at: "2023-05-23T08:33:54.590Z",
								version: "beta",
								num_tables: 13,
								file_size: 33067008,
								running_in_region: "WEUR",
							},
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				}),
				http.post(
					"*/accounts/:accountId/d1/database/*/time_travel/restore",
					async () => {
						return HttpResponse.json(
							{
								result: {
									bookmark: "a",
								},
								success: true,
								errors: [],
								messages: [],
							},
							{ status: 200 }
						);
					}
				)
			);
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2011-10-05T14:48:00.000Z"));
		});
		afterEach(() => {
			vi.useRealTimers();
		});
		describe("restore", () => {
			it("should print as json, without wrangler banner", async () => {
				await runWrangler(
					`d1 time-travel restore db --timestamp=2011-09-05T14:48:00.000Z --json`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"{
					  \\"bookmark\\": \\"a\\"
					}"
				`);
			});

			it("should pretty print by default", async () => {
				await runWrangler(
					`d1 time-travel restore db --timestamp=2011-09-05T14:48:00.000Z"`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					------------------

					🚧 Restoring database db from bookmark undefined

					⚠️ This will overwrite all data in database db.
					In-flight queries and transactions will be cancelled.

					? OK to proceed (y/N)
					🤖 Using fallback value in non-interactive context: yes
					⚡️ Time travel in progress...
					✅ Database db restored back to bookmark a

					↩️ To undo this operation, you can restore to the previous bookmark: undefined"
				`);
			});
		});
		describe("info", () => {
			it("should print as json, without wrangler banner", async () => {
				await runWrangler(
					`d1 time-travel info db --timestamp=2011-09-05T14:48:00.000Z --json`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"{
					  \\"uuid\\": \\"d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06\\",
					  \\"name\\": \\"db\\",
					  \\"created_at\\": \\"2023-05-23T08:33:54.590Z\\",
					  \\"version\\": \\"beta\\",
					  \\"num_tables\\": 13,
					  \\"file_size\\": 33067008,
					  \\"running_in_region\\": \\"WEUR\\"
					}"
				`);
			});
			it("should pretty print by default", async () => {
				await runWrangler(
					`d1 time-travel info db --timestamp=2011-09-05T14:48:00.000Z"`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					------------------

					🚧 Time Traveling...
					⚠️ Timestamp '2011-09-05T14:48:00.000Z' corresponds with bookmark 'undefined'
					⚡️ To restore to this specific bookmark, run:
					 \`wrangler d1 time-travel restore db --bookmark=undefined\`
					      "
				`);
			});
		});
	});
});
