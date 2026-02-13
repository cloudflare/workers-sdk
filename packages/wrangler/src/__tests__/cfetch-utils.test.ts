import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import { extractAccountTag, hasMorePages } from "../cfetch";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

/**
hasMorePages is a function that returns a boolean based on the result_info object returned from the cloudflare v4 API - if the current page is less than the total number of pages, it returns true, otherwise false.
*/

describe("hasMorePages", () => {
	it("should handle result_info not having enough results to paginate", ({
		expect,
	}) => {
		expect(
			hasMorePages({
				page: 1,
				per_page: 10,
				count: 5,
				total_count: 5,
			})
		).toBe(false);
	});
	it("should return true if the current page is less than the total number of pages", ({
		expect,
	}) => {
		expect(
			hasMorePages({
				page: 1,
				per_page: 10,
				count: 10,
				total_count: 100,
			})
		).toBe(true);
	});
	it("should return false if we are on the last page of results", ({
		expect,
	}) => {
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
	const std = mockConsoleMethods();

	it("should include api errors, messages and documentation_url in error", async ({
		expect,
	}) => {
		msw.use(
			http.get("*/user", () => {
				return HttpResponse.json(
					createFetchResult(
						null,
						false,
						[
							{
								code: 10001,
								message: "error one",
								documentation_url: "https://example.com/1",
							},
							{
								code: 10002,
								message: "error two",
								documentation_url: "https://example.com/2",
							},
							{
								code: 10003,
								message: "error three",
							},
						],
						["message one", "message two"]
					)
				);
			}),
			http.get("*/user/tokens/verify", () => {
				return HttpResponse.json(createFetchResult([]));
			})
		);
		await expect(runWrangler("whoami")).rejects.toMatchObject({
			text: "A request to the Cloudflare API (/user) failed.",
			notes: [
				{
					text: "error one [code: 10001]\nTo learn more about this error, visit: https://example.com/1",
				},
				{
					text: "error two [code: 10002]\nTo learn more about this error, visit: https://example.com/2",
				},
				{
					text: "error three [code: 10003]",
				},
				{ text: "message one" },
				{ text: "message two" },
				{
					text: "\nIf you think this is a bug, please open an issue at: https://github.com/cloudflare/workers-sdk/issues/new/choose",
				},
			],
		});
	});

	it("nested", async ({ expect }) => {
		msw.use(
			http.get("*/user", () => {
				return HttpResponse.json(
					createFetchResult(
						null,
						false,
						[
							{
								code: 10001,
								message: "error one",
								documentation_url: "https://example.com/1",
								error_chain: [
									{
										code: 10002,
										message: "error two",
										error_chain: [
											{
												code: 10003,
												message: "error three",
												documentation_url: "https://example.com/3",
												error_chain: [
													{
														code: 10004,
														message: "error 4",
														documentation_url: "https://example.com/4",
													},
												],
											},
										],
									},
								],
							},
						],
						["message one", "message two"]
					)
				);
			}),
			http.get("*/user/tokens/verify", () => {
				return HttpResponse.json(createFetchResult([]));
			})
		);
		await expect(runWrangler("whoami")).rejects.toMatchInlineSnapshot(
			`[APIError: A request to the Cloudflare API (/user) failed.]`
		);

		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/user) failed.[0m

			  error one [code: 10001]
			  To learn more about this error, visit: [4mhttps://example.com/1[0m

			  - error two [code: 10002]

			    - error three [code: 10003]
			      To learn more about this error, visit: [4mhttps://example.com/3[0m

			      - error 4 [code: 10004]
			        To learn more about this error, visit: [4mhttps://example.com/4[0m

			  message one
			  message two

			  If you think this is a bug, please open an issue at:
			  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

			",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Getting User settings...
			",
			  "warn": "",
			}
		`);
	});

	it("should include api errors without messages", async ({ expect }) => {
		msw.use(
			http.get("*/user", () => {
				return HttpResponse.json({
					result: null,
					success: false,
					errors: [
						{
							code: 10000,
							message: "error",
							documentation_url: "https://example.com/1",
						},
						{ code: 10001, message: "error 1" },
					],
				});
			}),
			http.get("*/user/tokens/verify", () => {
				return HttpResponse.json(createFetchResult([]));
			})
		);
		await expect(runWrangler("whoami")).rejects.toMatchObject({
			text: "A request to the Cloudflare API (/user) failed.",
			notes: [
				{
					text: "error [code: 10000]\nTo learn more about this error, visit: https://example.com/1",
				},
				{ text: "error 1 [code: 10001]" },
			],
		});
	});
});

describe("extractAccountTag", () => {
	it("should return undefined when resource does not have it", ({ expect }) => {
		expect(extractAccountTag("/accounts")).toBeUndefined();
		expect(extractAccountTag("/accounts/")).toBeUndefined();
		expect(extractAccountTag("/accounts//more")).toBeUndefined();
	});
	it("should return tag when resource has it", ({ expect }) => {
		expect(extractAccountTag("/accounts/foo")).toBe("foo");
		expect(extractAccountTag("/accounts/bar/")).toBe("bar");
		expect(extractAccountTag("/accounts/baz/more")).toBe("baz");
	});
});
