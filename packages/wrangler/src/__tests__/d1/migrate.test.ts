import * as fs from "node:fs";
import * as path from "node:path";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { describe, it, vi } from "vitest";
import { reinitialiseAuthTokens } from "../../user";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockSetTimeout } from "../helpers/mock-set-timeout";
import { getMswSuccessMembershipHandlers, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("migrate", () => {
	runInTempDir();
	const mockStd = mockConsoleMethods();
	mockSetTimeout();

	const { setIsTTY } = useMockIsTTY();

	describe("create", () => {
		it("should reject the --local flag for create", async ({ expect }) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});

			await expect(
				runWrangler("d1 migrations create test some-message --local DATABASE")
			).rejects.toThrowError(`Unknown argument: local`);
		});

		it("should error when no config file is present", async ({ expect }) => {
			setIsTTY(false);
			await expect(
				runWrangler("d1 migrations create DATABASE test-migration")
			).rejects.toThrowError(
				"No configuration file found. Create a wrangler.jsonc file to define your D1 database."
			);
		});

		it("should work without a database_id", async ({ expect }) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [{ binding: "D1", database_name: "D1" }],
			});

			await runWrangler("d1 migrations create D1 test-migration");
			expect(mockStd.out).toContain("Successfully created Migration");
		});

		it("should create migrations after nested migrations", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [{ binding: "D1", database_name: "D1" }],
			});
			fs.mkdirSync(path.join("migrations", "20240501120000_initial"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join("migrations", "20240501120000_initial", "migration.sql"),
				""
			);

			await runWrangler("d1 migrations create D1 test-migration");

			expect(
				fs.existsSync(
					path.join("migrations", "20240501120001_test-migration.sql")
				)
			).toBe(true);
		});
	});

	describe("apply", () => {
		mockAccountId({ accountId: null });
		mockApiToken();
		it("should not attempt to login in local mode", async ({ expect }) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			// If we get to the point where we are checking for migrations then we have not been asked to log in.
			await expect(
				runWrangler("d1 migrations apply DATABASE")
			).rejects.toThrowError(`No migrations present at <cwd>/migrations.`);
		});

		it("should try to read D1 config from wrangler.toml", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig();
			await expect(
				runWrangler("d1 migrations apply DATABASE --remote")
			).rejects.toThrowError(
				"Couldn't find a D1 DB with the name or binding 'DATABASE' in your wrangler.toml file."
			);
		});

		it("should not try to read wrangler.toml in local mode", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(
				runWrangler("d1 migrations apply DATABASE")
			).rejects.toThrowError(`No migrations present at <cwd>/migrations.`);
		});

		it("should error when no config file is present", async ({ expect }) => {
			setIsTTY(false);
			await expect(
				runWrangler("d1 migrations apply DATABASE")
			).rejects.toThrowError(
				"No configuration file found. Create a wrangler.jsonc file to define your D1 database."
			);
		});

		it("should reject the use of --preview with --local", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			await runWrangler("d1 migrations create db test");

			await expect(
				runWrangler("d1 migrations apply --local db --preview")
			).rejects.toThrowError(`Error: can't use --preview without --remote`);
		});

		it("multiple accounts: should throw when trying to apply migrations without an account_id in config", async ({
			expect,
		}) => {
			setIsTTY(false);

			// `migrations_dir` below is absolute and escapes `runInTempDir`, so
			// previous runs of this same test (or sibling tests) can leave files
			// behind. Wipe before each run so we apply exactly one migration.
			fs.rmSync("/tmp/my-migrations-go-here-1", {
				recursive: true,
				force: true,
			});
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "/tmp/my-migrations-go-here-1",
					},
				],
			});
			msw.use(
				...getMswSuccessMembershipHandlers([
					{ id: "IG-88", name: "enterprise" },
					{ id: "R2-D2", name: "enterprise-nx" },
				])
			);
			mockConfirm({
				text: `No migrations folder found.
Ok to create /tmp/my-migrations-go-here-1?`,
				result: true,
			});
			await runWrangler("d1 migrations create db test");
			mockConfirm({
				text: `About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});
			await expect(
				runWrangler("d1 migrations apply db --remote")
			).rejects.toThrowError(
				`More than one account available but unable to select one in non-interactive mode.`
			);
		});
		it("multiple accounts: should let the user apply migrations with an account_id in config", async ({
			expect,
		}) => {
			setIsTTY(false);
			msw.use(
				http.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async () => {
						return HttpResponse.json(
							{
								result: [
									{
										results: [],
										success: true,
										meta: {},
									},
								],
								success: true,
								errors: [],
								messages: [],
							},
							{ status: 200 }
						);
					}
				),
				http.get("*/accounts/:accountId/d1/database/:databaseId", async () => {
					return HttpResponse.json(
						{
							result: {
								file_size: 7421952,
								name: "benchmark3-v1",
								num_tables: 2,
								uuid: "7b0c1d24-ec57-4179-8663-9b82dafe9277",
								version: "production",
							},
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				}),
				...getMswSuccessMembershipHandlers([
					{ id: "IG-88", name: "enterprise" },
					{ id: "R2-D2", name: "enterprise-nx" },
				])
			);
			// `migrations_dir` below is absolute and escapes `runInTempDir`, so
			// previous runs of this same test (or sibling tests) can leave files
			// behind. Wipe before each run so we apply exactly one migration.
			fs.rmSync("/tmp/my-migrations-go-here-2", {
				recursive: true,
				force: true,
			});
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "/tmp/my-migrations-go-here-2",
					},
				],
				account_id: "nx01",
			});
			mockConfirm({
				text: `No migrations folder found.
Ok to create /tmp/my-migrations-go-here-2?`,
				result: true,
			});
			await runWrangler("d1 migrations create db test");
			mockConfirm({
				text: `About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});
			await runWrangler("d1 migrations apply db --remote");
			expect(mockStd.out).toContain("0001_test.sql");
			expect(mockStd.out).toContain("✅");
		});

		it("should apply nested migrations with relative path names", async ({
			expect,
		}) => {
			setIsTTY(false);
			const sqlBodies: string[] = [];
			msw.use(
				http.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async ({ request }) => {
						const body = (await request.json()) as { sql?: string };
						if (body.sql) {
							sqlBodies.push(body.sql);
						}

						return HttpResponse.json(
							{
								result: [
									{
										results: [],
										success: true,
										meta: {},
									},
								],
								success: true,
								errors: [],
								messages: [],
							},
							{ status: 200 }
						);
					}
				),
				http.get("*/accounts/:accountId/d1/database/:databaseId", async () => {
					return HttpResponse.json(
						{
							result: {
								file_size: 7421952,
								name: "db",
								num_tables: 2,
								uuid: "xxxx",
								version: "production",
							},
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				})
			);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
					},
				],
				account_id: "account-id",
			});
			fs.mkdirSync(path.join("migrations", "20240501120000_initial"), {
				recursive: true,
			});
			fs.mkdirSync(path.join("migrations", "20240501130000_quo'ted"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join("migrations", "20240501120000_initial", "migration.sql"),
				"CREATE TABLE users (id INTEGER PRIMARY KEY);"
			);
			fs.writeFileSync(
				path.join("migrations", "20240501130000_quo'ted", "migration.sql"),
				"CREATE INDEX quoted_test ON users (id);"
			);
			mockConfirm({
				text: `About to apply 2 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			await runWrangler("d1 migrations apply db --remote");

			const initialMigrationSql = sqlBodies.find((sql) => {
				return sql.includes("CREATE TABLE users");
			});
			const quotedMigrationSql = sqlBodies.find((sql) => {
				return sql.includes("CREATE INDEX quoted_test");
			});
			expect(initialMigrationSql).toContain(
				"values ('20240501120000_initial/migration.sql');"
			);
			expect(initialMigrationSql).not.toContain("values ('migration.sql');");
			expect(quotedMigrationSql).toContain(
				"values ('20240501130000_quo''ted/migration.sql');"
			);
			expect(mockStd.out).toContain("20240501120000_initial/migration.sql");
			expect(mockStd.out).toContain("20240501130000_quo'ted/migration.sql");
		});

		it("should apply each .sql file in a multi-file migration directory and ignore non-.sql files", async ({
			expect,
		}) => {
			// This is the case the D1 team explicitly flagged on PR #10570: a
			// single migration directory containing multiple `.sql` files. The
			// agreed-upon behaviour is that each `.sql` file becomes its own
			// migration (its own transaction-equivalent), and any non-`.sql`
			// siblings are ignored. We also drop a Drizzle-style journal file
			// next to the migration dir to confirm `meta/_journal.json` is
			// likewise ignored.
			setIsTTY(false);
			const appliedMigrationNames: string[] = [];
			msw.use(
				http.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async ({ request }) => {
						const body = (await request.json()) as { sql?: string };
						const match = body.sql?.match(
							/INSERT INTO d1_migrations \(name\)\s+values \('([^']+(?:''[^']*)*)'\);/
						);
						if (match) {
							appliedMigrationNames.push(match[1].replaceAll("''", "'"));
						}
						return HttpResponse.json(
							{
								result: [{ results: [], success: true, meta: {} }],
								success: true,
								errors: [],
								messages: [],
							},
							{ status: 200 }
						);
					}
				),
				http.get("*/accounts/:accountId/d1/database/:databaseId", async () => {
					return HttpResponse.json(
						{
							result: {
								file_size: 0,
								name: "db",
								num_tables: 0,
								uuid: "xxxx",
								version: "production",
							},
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				})
			);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
					},
				],
				account_id: "account-id",
			});
			fs.mkdirSync(path.join("migrations", "0001_initial"), {
				recursive: true,
			});
			fs.mkdirSync(path.join("migrations", "meta"), { recursive: true });
			// Three `.sql` files in the same directory — `readdir` order is not
			// guaranteed, but the discovery walker sorts the final list, so we
			// expect them to be applied in lexical order.
			fs.writeFileSync(
				path.join("migrations", "0001_initial", "20_seed.sql"),
				"INSERT INTO users VALUES (1);"
			);
			fs.writeFileSync(
				path.join("migrations", "0001_initial", "10_schema.sql"),
				"CREATE TABLE users (id INTEGER PRIMARY KEY);"
			);
			fs.writeFileSync(
				path.join("migrations", "0001_initial", "00_extensions.sql"),
				"-- noop"
			);
			fs.writeFileSync(
				path.join("migrations", "0001_initial", "README.md"),
				"# initial"
			);
			fs.writeFileSync(
				path.join("migrations", "meta", "_journal.json"),
				'{"entries":[]}'
			);
			mockConfirm({
				text: `About to apply 3 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			await runWrangler("d1 migrations apply db --remote");

			expect(appliedMigrationNames).toEqual([
				"0001_initial/00_extensions.sql",
				"0001_initial/10_schema.sql",
				"0001_initial/20_seed.sql",
			]);
			// Confirm non-`.sql` siblings never appear as migration names.
			expect(mockStd.out).not.toContain("README.md");
			expect(mockStd.out).not.toContain("_journal.json");
		});
	});

	describe("list", () => {
		mockAccountId();
		mockApiToken({ apiToken: null });

		it("should not attempt to login in local mode", async ({ expect }) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			// If we get to the point where we are checking for migrations then we have not been asked to log in.
			await expect(
				runWrangler("d1 migrations list --local DATABASE")
			).rejects.toThrowError(`No migrations present at <cwd>/migrations.`);
		});

		it("should error when no config file is present", async ({ expect }) => {
			setIsTTY(false);
			await expect(
				runWrangler("d1 migrations list DATABASE")
			).rejects.toThrowError(
				"No configuration file found. Create a wrangler.jsonc file to define your D1 database."
			);
		});

		it("should use the custom migrations folder when provided", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "my-migrations-go-here",
					},
				],
			});
			await expect(
				runWrangler("d1 migrations list --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at <cwd>/my-migrations-go-here.`
			);
		});

		it("should try to read D1 config from wrangler.toml when logged in", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "api-token");
			reinitialiseAuthTokens();
			setIsTTY(false);
			writeWranglerConfig();
			await expect(
				runWrangler("d1 migrations list DATABASE --remote")
			).rejects.toThrowError(
				"Couldn't find a D1 DB with the name or binding 'DATABASE' in your wrangler.toml file."
			);
		});

		it("should throw if user is not authenticated and not using --local", async ({
			expect,
		}) => {
			setIsTTY(false);

			await expect(
				runWrangler("d1 migrations list DATABASE --remote")
			).rejects.toThrowError(
				"In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work"
			);
		});

		it("should not try to read wrangler.toml in local mode", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(
				runWrangler("d1 migrations list DATABASE")
			).rejects.toThrowError(`No migrations present at <cwd>/migrations.`);
		});
	});
});
