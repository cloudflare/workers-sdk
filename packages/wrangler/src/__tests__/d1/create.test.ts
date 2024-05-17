import { rest } from "msw";
import { describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships, mockOAuthFlow } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("create", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	mockConsoleMethods();
	runInTempDir();
	const std = mockConsoleMethods();
	const { mockOAuthServerCallback } = mockOAuthFlow();
	const { setIsTTY } = useMockIsTTY();

	it("should throw if local flag is provided", async ({ expect }) => {
		await expect(runWrangler("d1 create test --local")).rejects.toThrowError(
			`Unknown argument: local`
		);
	});

	it("should throw if remote flag is provided", async ({ expect }) => {
		await expect(runWrangler("d1 create test --remote")).rejects.toThrowError(
			`Unknown argument: remote`
		);
	});

	it("should throw if location flag isn't in the list", async ({ expect }) => {
		setIsTTY(false);
		mockOAuthServerCallback();
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		await expect(
			runWrangler("d1 create test --location sydney")
		).rejects.toThrowError(
			`Location 'sydney' invalid. Valid values are weur,eeur,apac,oc,wnam,enam`
		);
	});

	it("should try send a request to the API for a valid input", async ({
		expect,
	}) => {
		setIsTTY(false);
		mockOAuthServerCallback();
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		msw.use(
			rest.post("*/accounts/:accountId/d1/database", async (_req, res, ctx) => {
				return res(
					ctx.status(200),
					ctx.json({
						result: {
							uuid: "51e7c314-456e-4167-b6c3-869ad188fc23",
							name: "test",
							primary_location_hint: "OC",
							created_in_region: "OC",
						},
						success: true,
						errors: [],
						messages: [],
					})
				);
			})
		);
		await runWrangler("d1 create test --location oc");
		expect(std.out).toMatchInlineSnapshot(`
		"✅ Successfully created DB 'test' in region OC
		Created your new D1 database.

		[[d1_databases]]
		binding = \\"DB\\" # i.e. available in your Worker on env.DB
		database_name = \\"test\\"
		database_id = \\"51e7c314-456e-4167-b6c3-869ad188fc23\\""
	`);
	});
});
