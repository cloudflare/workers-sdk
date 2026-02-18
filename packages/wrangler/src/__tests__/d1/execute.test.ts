import fs from "node:fs";
import { join } from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("execute", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	// We turn on SENTRY reporting so that we can prove that Wrangler will not attempt to report user errors.
	useSentry();

	it("should require login when running against prod", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler("d1 execute db --command 'select 1;' --remote")
		).rejects.toThrowError(
			`In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work. Please go to https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ for instructions on how to create an api token, and assign its value to CLOUDFLARE_API_TOKEN.`
		);
	});

	it("should expect either --command or --file", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(runWrangler("d1 execute db")).rejects.toThrowError(
			`Error: must provide --command or --file`
		);
	});

	it("should reject use of both --command and --file", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(
				"d1 execute db --command='SELECT * FROM CUSTOMERS' --file=query.sql"
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Error: can't provide both --command and --file.]`
		);
		expect(std.out).not.toMatch(
			"Would you like to report this error to Cloudflare?"
		);
	});

	it("should reject the use of --remote with --local", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --remote`)
		).rejects.toThrowError(
			"Error: can't use --local and --remote at the same time"
		);
	});

	it("should reject the use of --preview with --local", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --preview`)
		).rejects.toThrowError(`Error: can't use --preview without --remote`);
	});

	it("should reject the use of --preview with --local with --json", async ({
		expect,
	}) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --preview --json`)
		).rejects.toThrowError(
			JSON.stringify(
				{
					error: {
						text: "Error: can't use --preview without --remote",
					},
				},
				null,
				2
			)
		);
	});

	it("should reject a binary SQLite DB", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});
		const path = join(__dirname, "fixtures", "db.sqlite3");
		fs.copyFileSync(path, "db.sqlite3");

		await expect(
			runWrangler(`d1 execute db --file db.sqlite3 --local --json`)
		).rejects.toThrowError(
			JSON.stringify(
				{
					error: {
						text: "Provided file is a binary SQLite database file instead of an SQL text file. The execute command can only process SQL text files. Please export an SQL file from your SQLite database and try again.",
					},
				},
				null,
				2
			)
		);
	});

	it("should throw a UserError if file does not exist", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(runWrangler(`d1 execute db --file missing.sql --local --json`))
			.rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: {
			  "error": {
			    "text": "Unable to read SQL text file /"missing.sql/". Please check the file path and try again."
			  }
			}]
		`);
	});

	it("should treat SQLite constraint errors as UserErrors", async ({
		expect,
	}) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		// First create a table with a foreign key constraint
		const setupSQL = `
			CREATE TABLE users (id INTEGER PRIMARY KEY);
			CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, FOREIGN KEY(user_id) REFERENCES users(id));
		`;
		fs.writeFileSync("setup.sql", setupSQL);
		await runWrangler("d1 execute db --file setup.sql --local");

		// Now try to violate the foreign key constraint
		const violationSQL = `INSERT INTO posts (id, user_id) VALUES (1, 999);`;
		fs.writeFileSync("violation.sql", violationSQL);

		await expect(
			runWrangler("d1 execute db --file violation.sql --local")
		).rejects.toThrow(UserError);
	});

	it("should show banner by default", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await runWrangler("d1 execute db --command 'select 1;'");
		expect(std.out).toContain("⛅️ wrangler x.x.x");
	});

	it("should execute locally without database_id", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [{ binding: "D1", database_name: "D1" }],
		});

		await runWrangler("d1 execute D1 --command 'select 1;' --local");
		expect(std.out).toContain("1 command executed successfully");
	});

	it("should output valid JSON with --json flag", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await runWrangler("d1 execute db --command 'select 1;' --json");
		expect(JSON.parse(std.out)).toMatchObject([
			{
				results: [{ "1": 1 }],
				success: true,
			},
		]);
	});

	describe("duration formatting", () => {
		mockAccountId({ accountId: "some-account-id" });
		mockApiToken();

		it("should format duration to 2 decimal places in milliseconds for remote execution", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});

			mockGetMemberships([
				{
					id: "IG-88",
					account: { id: "some-account-id", name: "test-account" },
				},
			]);

			msw.use(
				http.get("*/accounts/:accountId/d1/database", async () => {
					return HttpResponse.json(
						createFetchResult([
							{ uuid: "xxxx", name: "db", created_at: "", version: "alpha" },
						])
					);
				}),
				http.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async () => {
						return HttpResponse.json(
							createFetchResult([
								{
									results: [{ result: 1 }],
									success: true,
									meta: { duration: 123.456 },
								},
							])
						);
					}
				)
			);

			await runWrangler("d1 execute db --command 'select 1;' --remote");
			expect(std.out).toMatch("🚣 Executed 1 command in 123.46ms");
		});

		it("should format batch execution duration with 2 decimal places", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});

			mockGetMemberships([
				{
					id: "IG-88",
					account: { id: "some-account-id", name: "test-account" },
				},
			]);

			msw.use(
				http.get("*/accounts/:accountId/d1/database", async () => {
					return HttpResponse.json(
						createFetchResult([
							{ uuid: "xxxx", name: "db", created_at: "", version: "alpha" },
						])
					);
				}),
				http.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async () => {
						return HttpResponse.json(
							createFetchResult([
								{
									results: [{ result: 1 }],
									success: true,
									meta: { duration: 100 },
								},
								{
									results: [{ result: 2 }],
									success: true,
									meta: { duration: 200.5 },
								},
								{
									results: [{ result: 3 }],
									success: true,
									meta: { duration: 50.25 },
								},
							])
						);
					}
				)
			);

			await runWrangler(
				"d1 execute db --command 'select 1; select 2; select 3;' --remote"
			);
			// Total: 100 + 200.5 + 50.25 = 350.75ms (with 2 decimal places)
			expect(std.out).toMatch("🚣 Executed 3 commands in 350.75ms");
		});
	});
});

function useSentry() {
	// @ts-expect-error TS does not know about SENTRY_DSN
	const oldSentryDsn = global.SENTRY_DSN;
	beforeEach(() => {
		// @ts-expect-error TS does not know about SENTRY_DSN
		global.SENTRY_DSN = "FAKE_VALUE";
	});
	afterEach(() => {
		// @ts-expect-error TS does not know about SENTRY_DSN
		global.SENTRY_DSN = oldSentryDsn;
	});
}
