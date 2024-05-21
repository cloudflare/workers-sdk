import fs from "fs";
import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships, mockOAuthFlow } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("execute", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	mockConsoleMethods();
	runInTempDir();
	const { mockOAuthServerCallback } = mockOAuthFlow();
	const { setIsTTY } = useMockIsTTY();
	it("should throw if output is missing", async () => {
		await expect(runWrangler("d1 export db --local")).rejects.toThrowError(
			`Missing required argument: output`
		);
	});

	it("should reject --local mode (for now)", async () => {
		await expect(
			runWrangler("d1 export db --local --output /tmp/test.sql")
		).rejects.toThrowError(
			`Local imports/exports will be coming in a future version of Wrangler.`
		);
	});

	it("should handle remote", async () => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});
		mockOAuthServerCallback();
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		const mockSqlContent = "PRAGMA defer_foreign_keys=TRUE;";

		msw.use(
			http.post(
				"*/accounts/:accountId/d1/database/:databaseId/export",
				async ({ request }) => {
					const body = (await request.json()) as Record<string, unknown>;

					// First request, initiates a new task
					if (!body.currentBookmark) {
						return HttpResponse.json(
							{
								success: true,
								result: {
									success: true,
									type: "export",
									at_bookmark: "yyyy",
									status: "active",
									messages: [
										"Generating xxxx-yyyy.sql",
										"Uploaded part 2", // out-of-order uploads ok
										"Uploaded part 1",
									],
								},
							},
							{ status: 202 }
						);
					}
					// Subsequent request, sees that it is complete
					else {
						return HttpResponse.json(
							{
								success: true,
								result: {
									success: true,
									type: "export",
									at_bookmark: "yyyy",
									status: "complete",
									result: {
										filename: "xxxx-yyyy.sql",
										signedUrl: "https://example.com/xxxx-yyyy.sql",
									},
									messages: [
										"Uploaded part 3",
										"Uploaded part 4",
										"Finished uploading xxxx-yyyy.sql in 4 parts.",
									],
								},
							},
							{ status: 200 }
						);
					}
				}
			)
		);
		msw.use(
			http.get("https://example.com/xxxx-yyyy.sql", async () => {
				return HttpResponse.text(mockSqlContent, { status: 200 });
			})
		);

		await runWrangler("d1 export db --remote --output /tmp/test.sql");
		expect(fs.readFileSync("/tmp/test.sql", "utf8")).toBe(mockSqlContent);
	});
});
