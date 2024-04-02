import fs from "fs";
import { rest } from "msw";
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
			rest.post(
				"*/accounts/:accountId/d1/database/:databaseId/export",
				async (_req, res, ctx) => {
					return res(
						ctx.status(200),
						ctx.json({
							result: { signedUrl: "https://example.com" },
							success: true,
							errors: [],
							messages: [],
						})
					);
				}
			)
		);
		msw.use(
			rest.get("https://example.com", async (req, res, ctx) => {
				return res(ctx.status(200), ctx.text(mockSqlContent));
			})
		);

		await runWrangler("d1 export db --remote --output /tmp/test.sql");
		expect(fs.readFileSync("/tmp/test.sql", "utf8")).toBe(mockSqlContent);
	});
});
