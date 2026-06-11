import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import {
	createFetchResult,
	getMswSuccessMembershipHandlers,
	msw,
} from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type { ExpectStatic } from "vitest";

describe("delete", () => {
	mockAccountId();
	mockApiToken();
	const std = mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "1701", name: "enterprise" }])
		);
		mockDatabaseGet("test-db", "db-uuid-123");
	});

	it("should not delete database when confirmation is rejected", async ({
		expect,
	}) => {
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

	it("should delete database when confirmation is accepted", async ({
		expect,
	}) => {
		setIsTTY(true);

		mockConfirm({
			text: "Ok to proceed?",
			result: true,
		});

		mockDatabaseDelete(expect, "db-uuid-123");

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

	it("should skip confirmation when --skip-confirmation flag is used", async ({
		expect,
	}) => {
		setIsTTY(false);

		mockDatabaseDelete(expect, "db-uuid-123");

		await runWrangler("d1 delete test-db --skip-confirmation");

		expect(std.out).toContain("Deleted 'test-db' successfully.");
	});
});

function mockDatabaseGet(name: string, uuid: string) {
	msw.use(
		http.get("*/accounts/:accountId/d1/database/:name", async ({ params }) => {
			if (params.name !== name) {
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 7404, message: "Not Found" }],
					},
					{ status: 404 }
				);
			}
			return HttpResponse.json({
				result: { uuid },
				success: true,
				errors: [],
				messages: [],
			});
		})
	);
}

function mockDatabaseDelete(expect: ExpectStatic, expectedUuid: string) {
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
