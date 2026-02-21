import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
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

describe("export", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	const std = mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	it("should throw if output is missing", async ({ expect }) => {
		await expect(runWrangler("d1 export db")).rejects.toThrowError(
			`Missing required argument: output`
		);
	});

	it("should throw if output is a directory", async ({ expect }) => {
		fs.mkdirSync("test-dir");

		await expect(
			runWrangler("d1 export db --output test-dir")
		).rejects.toThrowError(
			`Please specify a file path for --output, not a directory.`
		);
	});

	it("should throw if local and remote are both set", async ({ expect }) => {
		await expect(
			runWrangler("d1 export db --local --remote --output test-local.sql")
		).rejects.toThrowError("Arguments local and remote are mutually exclusive");
	});

	it("should handle local", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		// Verify the basic command works with an empty DB
		await runWrangler("d1 export db --output test-local.sql");
		expect(fs.readFileSync("test-local.sql", "utf8")).toBe(
			"PRAGMA defer_foreign_keys=TRUE;"
		);

		// Fill with data
		fs.writeFileSync(
			"data.sql",
			`
				CREATE TABLE foo(id INTEGER PRIMARY KEY, value TEXT);
				CREATE TABLE bar(id INTEGER PRIMARY KEY, value TEXT);
				INSERT INTO foo (value) VALUES ('xxx'),('yyy'),('zzz');
				INSERT INTO bar (value) VALUES ('aaa'),('bbb'),('ccc');
			`
		);
		await runWrangler("d1 execute db --file data.sql");

		// SQL output expectations
		const create_foo = "CREATE TABLE foo(id INTEGER PRIMARY KEY, value TEXT);";
		const create_bar = "CREATE TABLE bar(id INTEGER PRIMARY KEY, value TEXT);";
		const insert_foo = [
			`INSERT INTO "foo" ("id","value") VALUES(1,'xxx');`,
			`INSERT INTO "foo" ("id","value") VALUES(2,'yyy');`,
			`INSERT INTO "foo" ("id","value") VALUES(3,'zzz');`,
		];
		const insert_bar = [
			`INSERT INTO "bar" ("id","value") VALUES(1,'aaa');`,
			`INSERT INTO "bar" ("id","value") VALUES(2,'bbb');`,
			`INSERT INTO "bar" ("id","value") VALUES(3,'ccc');`,
		];

		// Full export
		await runWrangler("d1 export db --output test-full.sql");
		expect(fs.readFileSync("test-full.sql", "utf8")).toBe(
			[
				"PRAGMA defer_foreign_keys=TRUE;",
				create_foo,
				...insert_foo,
				create_bar,
				...insert_bar,
			].join("\n")
		);

		// Schema only
		await runWrangler("d1 export db --output test-schema.sql --no-data");
		expect(fs.readFileSync("test-schema.sql", "utf8")).toBe(
			["PRAGMA defer_foreign_keys=TRUE;", create_foo, create_bar].join("\n")
		);

		// Data only
		await runWrangler("d1 export db --output test-data.sql --no-schema");
		expect(fs.readFileSync("test-data.sql", "utf8")).toBe(
			["PRAGMA defer_foreign_keys=TRUE;", ...insert_foo, ...insert_bar].join(
				"\n"
			)
		);

		// Foo only
		await runWrangler("d1 export db --output test-data.sql --table foo");
		expect(fs.readFileSync("test-data.sql", "utf8")).toBe(
			["PRAGMA defer_foreign_keys=TRUE;", create_foo, ...insert_foo].join("\n")
		);
	});

	it("should handle remote", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		const mockSqlContent = "PRAGMA defer_foreign_keys=TRUE;";

		mockResponses();

		msw.use(
			http.get("https://example.com/xxxx-yyyy.sql", async () => {
				return HttpResponse.text(mockSqlContent, { status: 200 });
			})
		);

		await runWrangler("d1 export db --remote --output test-remote.sql");
		expect(fs.readFileSync("test-remote.sql", "utf8")).toBe(mockSqlContent);
	});

	it("should handle remote presigned URL errors", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);

		mockResponses();

		msw.use(
			http.get("https://example.com/xxxx-yyyy.sql", async () => {
				return HttpResponse.text(
					`<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>`,
					{ status: 403 }
				);
			})
		);

		await expect(
			runWrangler("d1 export db --remote --output test-remote.sql")
		).rejects.toThrowError(
			/There was an error while downloading from the presigned URL with status code: 403/
		);
	});

	it("should export locally without database_id", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [{ binding: "D1", database_name: "D1" }],
		});

		await runWrangler("d1 export D1 --output test-remote.sql");
		expect(std.out).toContain("Exporting SQL to test-remote.sql...");
	});

	it("should not export remotely without database_id", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [{ binding: "D1", database_name: "D1" }],
		});
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);

		await expect(
			runWrangler("d1 export D1 --output test-remote.sql --remote")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Found a database with name or binding D1 but it is missing a database_id, which is needed for operations on remote resources. Please create the remote D1 database by deploying your project or running 'wrangler d1 create D1'.]`
		);
	});
});

function mockResponses() {
	msw.use(
		http.post(
			"*/accounts/:accountId/d1/database/:databaseId/export",
			async ({ request }) => {
				// This endpoint is polled recursively. If we respond immediately,
				// the callstack builds up quickly leading to a hard-to-debug OOM error.
				// This timeout ensures that if the endpoint is accidently polled infinitely
				// the test will timeout before breaching available memory
				await setTimeout(10);

				const body = (await request.json()) as Record<string, unknown>;

				// First request, initiates a new task
				if (!body.current_bookmark) {
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
									signed_url: "https://example.com/xxxx-yyyy.sql",
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
}
