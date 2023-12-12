import { rest } from "msw";
import { hasMorePages } from "../cfetch";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

/**
hasMorePages is a function that returns a boolean based on the result_info object returned from the cloudflare v4 API - if the current page is less than the total number of pages, it returns true, otherwise false.
*/

describe("hasMorePages", () => {
	it("should handle result_info not having enough results to paginate", () => {
		expect(
			hasMorePages({
				page: 1,
				per_page: 10,
				count: 5,
				total_count: 5,
			})
		).toBe(false);
	});
	it("should return true if the current page is less than the total number of pages", () => {
		expect(
			hasMorePages({
				page: 1,
				per_page: 10,
				count: 10,
				total_count: 100,
			})
		).toBe(true);
	});
	it("should return false if we are on the last page of results", () => {
		expect(
			hasMorePages({
				page: 10,
				per_page: 10,
				count: 10,
				total_count: 100,
			})
		).toBe(false);
	});
});

describe("throwFetchError", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	it("should include api errors and messages in error", async () => {
		msw.use(
			rest.get("*/user", (req, res, ctx) => {
				return res(
					ctx.json(
						createFetchResult(
							null,
							false,
							[
								{ code: 10001, message: "error one" },
								{ code: 10002, message: "error two" },
							],
							["message one", "message two"]
						)
					)
				);
			})
		);
		await expect(runWrangler("whoami")).rejects.toMatchObject({
			text: "A request to the Cloudflare API (/user) failed.",
			notes: [
				{ text: "error one [code: 10001]" },
				{ text: "error two [code: 10002]" },
				{ text: "message one" },
				{ text: "message two" },
				{
					text: "\nIf you think this is a bug, please open an issue at: https://github.com/cloudflare/workers-sdk/issues/new/choose",
				},
			],
		});
	});
});
