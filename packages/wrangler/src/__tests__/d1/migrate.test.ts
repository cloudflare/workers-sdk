import * as fs from "node:fs";
import * as path from "node:path";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { describe, it, vi } from "vitest";
import * as d1Execute from "../../d1/execute";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockSetTimeout } from "../helpers/mock-set-timeout";
import { getMswSuccessMembershipHandlers, msw } from "../helpers/msw";
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
			).rejects.toThrow(`Unknown argument: local`);
		});

		it("should error when no config file is present", async ({ expect }) => {
			setIsTTY(false);
			await expect(
				runWrangler("d1 migrations create DATABASE test-migration")
			).rejects.toThrow(
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

		it("`create` succeeds when the new file matches a permissive pattern", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "migrations",
						migrations_pattern: "migrations/**/*.sql",
					},
				],
			});

			await runWrangler("d1 migrations create db test");

			const files = fs.readdirSync("./migrations");
			expect(files).toEqual(["0001_test.sql"]);
			expect(
				fs.readFileSync(path.join("./migrations", "0001_test.sql"), "utf8")
			).toContain("Migration number: 0001");
		});

		it("rejects `wrangler d1 migrations create` with an actionable error when the new file would not match the configured pattern", async ({
			expect,
		}) => {
			setIsTTY(false);
			// Use a JSONC config (what we recommend in our docs) so the
			// snapshot below reflects the typical user-facing message.
			writeWranglerConfig(
				{
					d1_databases: [
						{
							binding: "DATABASE",
							database_name: "db",
							database_id: "xxxx",
							migrations_dir: "migrations",
							// Pattern only matches nested files, so a top-level
							// `0001_test.sql` should be rejected.
							migrations_pattern: "migrations/*/migration.sql",
						},
					],
				},
				"./wrangler.jsonc"
			);
			fs.mkdirSync("./migrations", { recursive: true });

			await expect(runWrangler("d1 migrations create db test")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Wrangler would like to make a new migration called \`migrations/0001_test.sql\` but it does not match the configured \`migrations_pattern: "migrations/*/migration.sql"\` in your wrangler.jsonc file, so \`wrangler d1 migrations apply\` would not pick it up. \`wrangler d1 migrations create\` only writes top-level files inside \`migrations_dir\`.

				If you are using an ORM like drizzle to manage migrations, use the ORM's command (e.g. \`drizzle-kit generate\`) instead of \`wrangler d1 migrations create\` — it will create files in the nested layout your \`migrations_pattern\` expects.

				Otherwise, change \`migrations_pattern\` in your wrangler.jsonc file to match top-level \`.sql\` files (for example, \`migrations/*.sql\`).]
			`);
		});

		it("does not create migrations_dir when `wrangler d1 migrations create` fails the pattern check", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig(
				{
					d1_databases: [
						{
							binding: "DATABASE",
							database_name: "db",
							database_id: "xxxx",
							migrations_dir: "migrations",
							migrations_pattern: "migrations/*/migration.sql",
						},
					],
				},
				"./wrangler.jsonc"
			);
			// Deliberately do NOT pre-create `./migrations` and do NOT
			// `mockConfirm` the "Ok to create" prompt: if the pattern check
			// runs first we never reach the prompt, and the dir is still
			// absent after the throw.

			await expect(runWrangler("d1 migrations create db test")).rejects.toThrow(
				/does not match the configured/
			);

			expect(fs.existsSync("./migrations")).toBe(false);
		});

		it('`create` succeeds with `migrations_dir: "."` (project root as the migrations dir)', async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig(
				{
					d1_databases: [
						{
							binding: "DATABASE",
							database_name: "db",
							database_id: "xxxx",
							migrations_dir: ".",
						},
					],
				},
				"./wrangler.jsonc"
			);

			// `list`/`apply` discover top-level `.sql` files when migrations_dir
			// is ".", so `create` must be able to write one. The default pattern
			// normalizes to "*.sql"; the new file "0001_test.sql" at the project
			// root matches it, so create should succeed (not reject as "does not
			// match the configured migrations_pattern").
			await runWrangler("d1 migrations create db test");

			expect(fs.existsSync("0001_test.sql")).toBe(true);
			expect(fs.readFileSync("0001_test.sql", "utf8")).toContain(
				"Migration number: 0001"
			);
		});

		it("rejects a migration name containing a path separator with a clear error", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig(
				{
					d1_databases: [
						{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
					],
				},
				"./wrangler.jsonc"
			);

			// A `/` in the name would otherwise produce an extra path segment
			// (`migrations/0001_foo/bar.sql`) that the default pattern can't
			// match — surfacing as a confusing "does not match migrations_pattern"
			// error. We reject it up front instead.
			await expect(
				runWrangler("d1 migrations create db foo/bar")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				// snapshot process seems to replace \ with / for consistency across platforms
				`[Error: The migration name "foo/bar" contains a path separator ("/" or "/"). Please remove this and try again.]`
			);

			// And the dir must not have been created as a side effect.
			expect(fs.existsSync("migrations")).toBe(false);
		});

		it("rejects a migration name containing a backslash with a clear error", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig(
				{
					d1_databases: [
						{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
					],
				},
				"./wrangler.jsonc"
			);

			await expect(
				runWrangler(
					// windows shells need less escaping of backslashes than unix ones?
					process.platform === "win32"
						? "d1 migrations create db foo\\bar"
						: "d1 migrations create db foo\\\\bar"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				// snapshot process seems to replace \ with / for consistency across platforms
				`[Error: The migration name "foo//bar" contains a path separator ("/" or "/"). Please remove this and try again.]`
			);
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
			await expect(runWrangler("d1 migrations apply DATABASE")).rejects.toThrow(
				`No migrations present at <cwd>/migrations.`
			);
		});

		it("should try to read D1 config from wrangler.toml", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig();
			await expect(
				runWrangler("d1 migrations apply DATABASE --remote")
			).rejects.toThrow(
				"Couldn't find a D1 DB with the name or binding 'DATABASE' in your wrangler.toml file."
			);
		});

		it("should not try to read wrangler.toml in local mode", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(runWrangler("d1 migrations apply DATABASE")).rejects.toThrow(
				`No migrations present at <cwd>/migrations.`
			);
		});

		it("should error when no config file is present", async ({ expect }) => {
			setIsTTY(false);
			await expect(runWrangler("d1 migrations apply DATABASE")).rejects.toThrow(
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
			).rejects.toThrow(
				`Cannot use --preview without --remote. The --preview flag targets a preview D1 database, which requires the --remote flag. Remove --preview or add --remote.`
			);
		});

		it("multiple accounts: should throw when trying to apply migrations without an account_id in config", async ({
			expect,
		}) => {
			setIsTTY(false);

			const migrationsDir = path.join(process.cwd(), "my-migrations-go-here");
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: migrationsDir,
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
Ok to create ${migrationsDir}?`,
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
			).rejects.toThrow(
				`More than one account available but unable to select one in non-interactive mode.`
			);
		});
		it("multiple accounts: should let the user apply migrations with an account_id in config", async ({
			expect,
		}) => {
			setIsTTY(false);
			const std = mockConsoleMethods();
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
			const migrationsDir = path.join(process.cwd(), "my-migrations-go-here");
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: migrationsDir,
					},
				],
				account_id: "nx01",
			});
			mockConfirm({
				text: `No migrations folder found.
Ok to create ${migrationsDir}?`,
				result: true,
			});
			await runWrangler("d1 migrations create db test");
			mockConfirm({
				text: `About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});
			await runWrangler("d1 migrations apply db --remote");
			expect(std.out).toContain("Migrations to be applied:");
			expect(std.out).toContain("0001_test.sql");
		});

		it("should throw a clear error when executeSql returns null (execution cancelled)", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});

			await runWrangler("d1 migrations create db test");

			// Simulate executeSql returning null (e.g. user cancels the file-upload prompt).
			// Call order: initMigrationsTable → listAppliedMigrations → actual migration.
			vi.spyOn(d1Execute, "executeSql")
				.mockResolvedValueOnce([
					{ results: [], success: true, meta: {} as never },
				])
				.mockResolvedValueOnce([
					{ results: [], success: true, meta: {} as never },
				])
				.mockResolvedValueOnce(null);

			mockConfirm({
				text: `About to apply 1 migration(s)\nYour database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			await expect(
				runWrangler("d1 migrations apply db --local")
			).rejects.toThrow(
				`Migration "0001_test.sql" was not applied — execution was cancelled.`
			);
		});

		it("`apply` records each migration's name in `d1_migrations` as a path relative to `migrations_dir`", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "migrations",
						migrations_pattern: "migrations/**/*.sql",
					},
				],
			});

			// 3-levels-deep layout:
			//   migrations/0001_top.sql                            (level 1)
			//   migrations/0002_users/0001_init.sql                (level 2)
			//   migrations/0003_features/auth/0001_oauth.sql       (level 3)
			fs.mkdirSync("./migrations/0002_users", { recursive: true });
			fs.mkdirSync("./migrations/0003_features/auth", { recursive: true });
			fs.writeFileSync("./migrations/0001_top.sql", "-- top");
			fs.writeFileSync("./migrations/0002_users/0001_init.sql", "-- mid");
			fs.writeFileSync(
				"./migrations/0003_features/auth/0001_oauth.sql",
				"-- deep"
			);

			// Spy on `executeSql` and pluck the `INSERT INTO d1_migrations
			// (name) values ('...');` lines back out of the SQL `apply` emits.
			// Fragile — couples to the exact INSERT statement in apply.ts —
			// but unavoidable: applying against real Miniflare/D1 then
			// `SELECT name FROM d1_migrations` boots a fresh Miniflare per
			// executeSql call (~6 boots × ~2s for a 3-migration test) and
			// blows the per-test timeout. If executeSql ever batches, or
			// Miniflare startup gets materially faster, rewrite this against
			// real D1.
			const insertedNames: string[] = [];
			const spy = vi
				.spyOn(d1Execute, "executeSql")
				.mockImplementation(async ({ command }) => {
					if (typeof command === "string") {
						const match = command.match(
							/INSERT INTO "d1_migrations" \(name\)\s*values\s*\('([^']+)'\)/
						);
						if (match) {
							insertedNames.push(match[1]);
						}
					}
					return [{ results: [], success: true, meta: {} as never }];
				});

			mockConfirm({
				text: `About to apply 3 migration(s)\nYour database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			try {
				await runWrangler("d1 migrations apply db --local");
			} finally {
				spy.mockRestore();
			}

			// `name` values must be relative to `migrations_dir`, not absolute,
			// not project-relative. The snapshot locks in the exact shape so
			// it's obvious at a glance.
			expect(insertedNames).toMatchInlineSnapshot(`
				[
				  "0001_top.sql",
				  "0002_users/0001_init.sql",
				  "0003_features/auth/0001_oauth.sql",
				]
			`);
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
			).rejects.toThrow(`No migrations present at <cwd>/migrations.`);
		});

		it("should error when no config file is present", async ({ expect }) => {
			setIsTTY(false);
			await expect(runWrangler("d1 migrations list DATABASE")).rejects.toThrow(
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
			).rejects.toThrow(
				`No migrations present at <cwd>/my-migrations-go-here.`
			);
		});

		it("hints at `migrations_dir` when the folder is missing and the user has not set one", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig(
				{
					d1_databases: [
						{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
					],
				},
				"./wrangler.jsonc"
			);
			await expect(
				runWrangler("d1 migrations list --local DATABASE")
			).rejects.toThrow(`No migrations present at <cwd>/migrations.`);
			expect(mockStd.warn).toContain(
				"Set `migrations_dir` in your wrangler.jsonc file to choose a different path."
			);
		});

		it("does not hint at `migrations_dir` when the user set it, even to the default `./migrations`", async ({
			expect,
		}) => {
			setIsTTY(false);
			// `./migrations` normalizes to `migrations`, so a check against the
			// default path would wrongly conclude the user is on the default and
			// show the (misleading) "Set `migrations_dir`..." hint. The user did
			// set it explicitly, so no hint should appear.
			writeWranglerConfig(
				{
					d1_databases: [
						{
							binding: "DATABASE",
							database_name: "db",
							database_id: "xxxx",
							migrations_dir: "./migrations",
						},
					],
				},
				"./wrangler.jsonc"
			);
			await expect(
				runWrangler("d1 migrations list --local DATABASE")
			).rejects.toThrow(`No migrations present at <cwd>/migrations.`);
			expect(mockStd.warn).toContain("No migrations folder found.");
			expect(mockStd.warn).not.toContain("Set `migrations_dir`");
		});

		it("should try to read D1 config from wrangler.toml when logged in", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "api-token");
			setIsTTY(false);
			writeWranglerConfig();
			await expect(
				runWrangler("d1 migrations list DATABASE --remote")
			).rejects.toThrow(
				"Couldn't find a D1 DB with the name or binding 'DATABASE' in your wrangler.toml file."
			);
		});

		it("should throw if user is not authenticated and not using --local", async ({
			expect,
		}) => {
			setIsTTY(false);

			await expect(
				runWrangler("d1 migrations list DATABASE --remote")
			).rejects.toThrow(
				"In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work"
			);
		});

		it("should not try to read wrangler.toml in local mode", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(runWrangler("d1 migrations list DATABASE")).rejects.toThrow(
				`No migrations present at <cwd>/migrations.`
			);
		});

		it("`list` only shows migrations matching migrations_pattern (nested layout)", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "migrations",
						migrations_pattern: "migrations/*/migration.sql",
					},
				],
			});

			fs.mkdirSync("./migrations/0000_init", { recursive: true });
			fs.writeFileSync(
				"./migrations/0000_init/migration.sql",
				"-- nested migration"
			);
			// Top-level .sql file should NOT be listed because it doesn't match
			// the pattern.
			fs.writeFileSync("./migrations/should_be_ignored.sql", "-- noop");

			const spy = vi
				.spyOn(d1Execute, "executeSql")
				.mockResolvedValue([{ results: [], success: true, meta: {} as never }]);

			try {
				await runWrangler("d1 migrations list --local db");
			} finally {
				spy.mockRestore();
			}

			expect(mockStd.out).toContain("0000_init/migration.sql");
			expect(mockStd.out).not.toContain("should_be_ignored.sql");
		});

		it("`list` prints a drizzle hint when migrations_pattern is the default but a nested layout exists", async ({
			expect,
		}) => {
			setIsTTY(false);
			// Use a JSONC config (the format we recommend in our docs) so the
			// snapshot below reflects the typical user-facing message.
			writeWranglerConfig(
				{
					d1_databases: [
						{
							binding: "DATABASE",
							database_name: "db",
							database_id: "xxxx",
						},
					],
				},
				"./wrangler.jsonc"
			);

			fs.mkdirSync("./migrations/0000_init", { recursive: true });
			fs.writeFileSync("./migrations/0000_init/migration.sql", "-- nested");

			const spy = vi
				.spyOn(d1Execute, "executeSql")
				.mockResolvedValue([{ results: [], success: true, meta: {} as never }]);

			try {
				await runWrangler("d1 migrations list --local db");
			} finally {
				spy.mockRestore();
			}

			expect(mockStd.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mCould not find any migration files matching \`migrations/*.sql\`. It looks like there are migration files matching \`migrations/*/migration.sql\` though. If you are using drizzle to manage your migrations, please set \`migrations_pattern\` to \`migrations/*/migration.sql\` in wrangler.jsonc.[0m

				"
			`);
		});

		it('`list` with `migrations_dir: "."` treats the project root as the migrations dir', async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: ".",
					},
				],
			});

			// Seed the project root with a mix of files. Only the top-level
			// `.sql` files should be picked up.
			fs.writeFileSync("0001_top.sql", "-- top");
			fs.writeFileSync("0002_users.sql", "-- users");
			fs.writeFileSync("README.md", "# not a migration");
			fs.mkdirSync("nested", { recursive: true });
			fs.writeFileSync("nested/0003_deep.sql", "-- deep");

			const spy = vi
				.spyOn(d1Execute, "executeSql")
				.mockResolvedValue([{ results: [], success: true, meta: {} as never }]);

			try {
				await runWrangler("d1 migrations list --local db");
			} finally {
				spy.mockRestore();
			}

			expect(mockStd.out).toContain("0001_top.sql");
			expect(mockStd.out).toContain("0002_users.sql");
			expect(mockStd.out).not.toContain("README.md");
			expect(mockStd.out).not.toContain("0003_deep.sql");
		});

		it("rejects a `migrations_pattern` that does not start with `migrations_dir`", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig(
				{
					d1_databases: [
						{
							binding: "DATABASE",
							database_name: "db",
							database_id: "xxxx",
							migrations_dir: "migrations",
							migrations_pattern: "schema/*.sql",
						},
					],
				},
				"./wrangler.jsonc"
			);

			await expect(runWrangler("d1 migrations list --local db")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The configured \`migrations_pattern: "schema/*.sql"\` in your wrangler.jsonc file must start with \`migrations/\` to match \`"migrations_dir": "migrations"\`.

				Either change \`migrations_pattern\` so it starts with \`migrations/\` (for example, \`"migrations/*.sql"\`), or change \`migrations_dir\` to match the start of your pattern.]
			`);
		});

		it("rejects a `migrations_pattern` set without `migrations_dir` with an actionable error", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig(
				{
					d1_databases: [
						{
							binding: "DATABASE",
							database_name: "db",
							database_id: "xxxx",
							// migrations_dir intentionally not set.
							migrations_pattern: "migrations/*.sql",
						},
					],
				},
				"./wrangler.jsonc"
			);

			await expect(runWrangler("d1 migrations list --local db")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: You have set \`migrations_pattern: "migrations/*.sql"\` in your wrangler.jsonc file but have not set \`migrations_dir\` for this D1 binding.

				When \`migrations_pattern\` is set, \`migrations_dir\` must also be set, and \`migrations_pattern\` must start with \`\${migrations_dir}/\`. Add a \`migrations_dir\` entry to your wrangler.jsonc file (for example, \`"migrations_dir": "migrations"\`).]
			`);
		});

		it("should escape single quotes in migration filenames during apply", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "migrations",
					},
				],
			});
			fs.mkdirSync("./migrations", { recursive: true });
			fs.writeFileSync(
				"./migrations/0001_add_user's_settings.sql",
				"-- settings"
			);

			const executedQueries: string[] = [];
			const spy = vi
				.spyOn(d1Execute, "executeSql")
				.mockImplementation(async ({ command }) => {
					if (typeof command === "string") {
						executedQueries.push(command);
						if (command.includes("SELECT *")) {
							return [{ results: [], success: true, meta: {} as never }];
						}
					}
					return [{ results: [], success: true, meta: {} as never }];
				});

			mockConfirm({
				text: `About to apply 1 migration(s)\nYour database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			try {
				await runWrangler("d1 migrations apply db --local");
			} finally {
				spy.mockRestore();
			}

			const insertQuery = executedQueries.find((q) =>
				q.includes("INSERT INTO")
			);
			expect(insertQuery).toBeDefined();
			expect(insertQuery).toContain("'0001_add_user''s_settings.sql'");
		});

		it("should escape migrationsTableName using double quotes in SQL queries", async ({
			expect,
		}) => {
			setIsTTY(false);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "migrations",
						migrations_table: "my-custom-table",
					},
				],
			});
			fs.mkdirSync("./migrations", { recursive: true });
			fs.writeFileSync("./migrations/0001_init.sql", "-- init");

			const executedQueries: string[] = [];
			const spy = vi
				.spyOn(d1Execute, "executeSql")
				.mockImplementation(async ({ command }) => {
					if (typeof command === "string") {
						executedQueries.push(command);
					}
					return [{ results: [], success: true, meta: {} as never }];
				});

			mockConfirm({
				text: `About to apply 1 migration(s)\nYour database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			try {
				await runWrangler("d1 migrations apply db --local");
			} finally {
				spy.mockRestore();
			}

			// Verify table creation uses quoted table name
			const createQuery = executedQueries.find((q) =>
				q.includes("CREATE TABLE IF NOT EXISTS")
			);
			expect(createQuery).toBeDefined();
			expect(createQuery).toContain(
				'CREATE TABLE IF NOT EXISTS "my-custom-table"'
			);

			// Verify query uses quoted table name
			const selectQuery = executedQueries.find((q) => q.includes("SELECT *"));
			expect(selectQuery).toBeDefined();
			expect(selectQuery).toContain('FROM "my-custom-table"');

			// Verify insert uses quoted table name
			const insertQuery = executedQueries.find((q) =>
				q.includes("INSERT INTO")
			);
			expect(insertQuery).toBeDefined();
			expect(insertQuery).toContain('INSERT INTO "my-custom-table"');
		});
	});
});
