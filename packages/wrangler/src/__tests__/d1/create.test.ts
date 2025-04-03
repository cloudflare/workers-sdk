import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("create", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	mockConsoleMethods();
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	it("should throw if local flag is provided", async () => {
		await expect(runWrangler("d1 create test --local")).rejects.toThrowError(
			`Unknown argument: local`
		);
	});

	it("should throw if remote flag is provided", async () => {
		await expect(runWrangler("d1 create test --remote")).rejects.toThrowError(
			`Unknown argument: remote`
		);
	});

	it("should throw if location flag isn't in the list", async () => {
		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		await expect(
			runWrangler("d1 create test --location sydney")
		).rejects.toThrowError(
			`Location 'sydney' invalid. Valid values are weur,eeur,apac,oc,wnam,enam`
		);
	});

	it("should try send a request to the API for a valid input", async () => {
		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		msw.use(
			http.post("*/accounts/:accountId/d1/database", async () => {
				return HttpResponse.json({
					result: {
						uuid: "51e7c314-456e-4167-b6c3-869ad188fc23",
						name: "test",
						primary_location_hint: "OC",
						created_in_region: "OC",
					},
					success: true,
					errors: [],
					messages: [],
				});
			})
		);
		await runWrangler("d1 create test --location oc");
		expect(std.out).toMatchInlineSnapshot(`
			"✅ Successfully created DB 'test' in region OC
			Created your new D1 database.

			{
			  \\"d1_databases\\": [
			    {
			      \\"binding\\": \\"DB\\",
			      \\"database_name\\": \\"test\\",
			      \\"database_id\\": \\"51e7c314-456e-4167-b6c3-869ad188fc23\\"
			    }
			  ]
			}"
		`);
	});
});
