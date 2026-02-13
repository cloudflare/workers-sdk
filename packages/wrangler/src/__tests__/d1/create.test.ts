import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
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
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		await expect(runWrangler("d1 create test --location sydney")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: Invalid values:
			  Argument: location, Given: "sydney", Choices: "weur", "eeur", "apac", "oc", "wnam", "enam"]
		`);
	});

	it("should try send a request to the API for a valid input", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

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
		await runWrangler("d1 create test --location oc --binding MY_TEST_DB");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✅ Successfully created DB 'test' in region OC
			Created your new D1 database.

			To access your new D1 Database in your Worker, add the following snippet to your configuration file:
			{
			  "d1_databases": [
			    {
			      "binding": "MY_TEST_DB",
			      "database_name": "test",
			      "database_id": "51e7c314-456e-4167-b6c3-869ad188fc23"
			    }
			  ]
			}"
		`);
	});

	it("should fail if the jurisdiction provided is not supported", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		await expect(runWrangler("d1 create test --jurisdiction something")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: Invalid values:
			  Argument: jurisdiction, Given: "something", Choices: "eu", "fedramp"]
		`);
	});

	it("should try send jurisdiction to the API if it is a valid input", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

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
						created_in_region: "WEUR",
						jurisdiction: "eu",
					},
					success: true,
					errors: [],
					messages: [],
				});
			})
		);
		await runWrangler("d1 create test --jurisdiction eu --binding MY_TEST_DB");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✅ Successfully created DB 'test' in region WEUR
			Created your new D1 database.

			To access your new D1 Database in your Worker, add the following snippet to your configuration file:
			{
			  "d1_databases": [
			    {
			      "binding": "MY_TEST_DB",
			      "database_name": "test",
			      "database_id": "51e7c314-456e-4167-b6c3-869ad188fc23"
			    }
			  ]
			}"
		`);
	});

	it("should show a user-friendly error when database limit is reached", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		msw.use(
			http.post("*/accounts/:accountId/d1/database", async () => {
				return HttpResponse.json(
					{
						result: null,
						success: false,
						errors: [
							{
								code: 7406,
								message: "System limit reached: databases per account (10)",
							},
						],
						messages: [],
					},
					{ status: 400 }
				);
			})
		);

		await expect(runWrangler("d1 create test")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: You have reached the maximum number of D1 databases for your account.
			Please consider deleting unused databases, or visit the D1 documentation to learn more: https://developers.cloudflare.com/d1/

			To list your existing databases, run: wrangler d1 list
			To delete a database, run: wrangler d1 delete <database-name>]
		`);
	});
});
