import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in helper function */
import { beforeEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("delete", () => {
	mockAccountId();
	mockApiToken();
	const std = mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		mockDatabaseList("test-db", "db-uuid-123");
	});

	it("should not delete database when confirmation is rejected", async () => {
		setIsTTY(true);

		mockConfirm({
			text: "Ok to proceed?",
			result: false,
		});

		await runWrangler("d1 delete test-db");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Resource location: remote

			About to delete remote database DB 'test-db' (db-uuid-123).
			This action is irreversible and will permanently delete all data in the database.

			Not deleting."
		`);
	});

	it("should delete database when confirmation is accepted", async () => {
		setIsTTY(true);

		mockConfirm({
			text: "Ok to proceed?",
			result: true,
		});

		mockDatabaseDelete("db-uuid-123");

		await runWrangler("d1 delete test-db");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Resource location: remote

			About to delete remote database DB 'test-db' (db-uuid-123).
			This action is irreversible and will permanently delete all data in the database.

			Deleting...
			Deleted 'test-db' successfully."
		`);
	});

	it("should skip confirmation when --skip-confirmation flag is used", async () => {
		setIsTTY(false);

		mockDatabaseDelete("db-uuid-123");

		await runWrangler("d1 delete test-db --skip-confirmation");

		expect(std.out).toContain("Deleted 'test-db' successfully.");
	});
});

function mockDatabaseList(name: string, uuid: string) {
	msw.use(
		http.get("*/accounts/:accountId/d1/database", async () => {
			return HttpResponse.json(
				{
					result: [
						{
							uuid,
							name,
							primary_location_hint: "WNAM",
							created_in_region: "WNAM",
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
}

function mockDatabaseDelete(expectedUuid: string) {
	msw.use(
		http.delete(
			"*/accounts/:accountId/d1/database/:databaseId",
			async ({ params }) => {
				expect(params.databaseId).toBe(expectedUuid);
				return HttpResponse.json(createFetchResult({}));
			}
		)
	);
}
