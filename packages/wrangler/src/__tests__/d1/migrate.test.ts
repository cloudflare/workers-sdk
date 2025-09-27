import fs from "node:fs";
import { http, HttpResponse } from "msw";
import { reinitialiseAuthTokens } from "../../user";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { mockSetTimeout } from "../helpers/mock-set-timeout";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";

describe("migrate", () => {
	runInTempDir();
	mockConsoleMethods();
	mockSetTimeout();

	const { setIsTTY } = useMockIsTTY();

	describe("create", () => {
		it("should reject the --local flag for create", async () => {
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
	});

	describe("apply", () => {
		mockAccountId({ accountId: null });
		mockApiToken();
		it("should not attempt to login in local mode", async () => {
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

		it("should try to read D1 config from wrangler.toml", async () => {
			setIsTTY(false);
			writeWranglerConfig();
			await expect(
				runWrangler("d1 migrations apply DATABASE --remote")
			).rejects.toThrowError(
				"Couldn't find a D1 DB with the name or binding 'DATABASE' in your wrangler.toml file."
			);
		});

		it("should not try to read wrangler.toml in local mode", async () => {
			setIsTTY(false);
			writeWranglerConfig();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(
				runWrangler("d1 migrations apply DATABASE")
			).rejects.toThrowError(`No migrations present at <cwd>/migrations.`);
		});

		it("should reject the use of --preview with --local", async () => {
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

		it("multiple accounts: should throw when trying to apply migrations without an account_id in config", async () => {
			setIsTTY(false);

			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "/tmp/my-migrations-go-here",
					},
				],
			});
			mockGetMemberships([
				{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
				{ id: "R2-D2", account: { id: "nx01", name: "enterprise-nx" } },
			]);
			mockConfirm({
				text: `No migrations folder found.
Ok to create /tmp/my-migrations-go-here?`,
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
		it("multiple accounts: should let the user apply migrations with an account_id in config", async () => {
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
				)
			);
			msw.use(
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
				})
			);
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "/tmp/my-migrations-go-here",
					},
				],
				account_id: "nx01",
			});
			mockGetMemberships([
				{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
				{ id: "R2-D2", account: { id: "nx01", name: "enterprise-nx" } },
			]);
			mockConfirm({
				text: `No migrations folder found.
Ok to create /tmp/my-migrations-go-here?`,
				result: true,
			});
			await runWrangler("d1 migrations create db test");
			mockConfirm({
				text: `About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});
			await runWrangler("d1 migrations apply db --remote");
			expect(std.out).toBe("");
		});

		it("applies migrations from a migration directory containing .sql files", async () => {
			setIsTTY(false);
			const commands: string[] = [];

			msw.use(
				http.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async (req) => {
						const { body } = req.request;
						if (body && typeof body === "object") {
							commands.push(JSON.stringify(body));
						} else {
							commands.push(String(body));
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
				)
			);

			msw.use(
				http.get("*/accounts/:accountId/d1/database/:databaseId", async () => {
					return HttpResponse.json(
						{
							result: {
								file_size: 123,
								name: "testdb",
								num_tables: 0,
								uuid: "uuid",
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
						migrations_dir: "migrations",
					},
				],
				account_id: "nx01",
			});

			mockGetMemberships([
				{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
				{ id: "R2-D2", account: { id: "nx01", name: "enterprise-nx" } },
			]);

			// Create migration directory with two sql files
			fs.mkdirSync("migrations/001_complex", { recursive: true });
			fs.writeFileSync(
				"migrations/001_complex/01_schema.sql",
				"CREATE TABLE users (id INTEGER PRIMARY KEY);"
			);
			fs.writeFileSync(
				"migrations/001_complex/02_seed.sql",
				"INSERT INTO users (id) VALUES (1);"
			);

			mockConfirm({
				text: `About to apply 1 migration(s)\nYour database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			await runWrangler("d1 migrations apply db --remote");

			expect(commands.some((c) => c.includes("CREATE TABLE users"))).toBe(true);
			expect(commands.some((c) => c.includes("INSERT INTO users"))).toBe(true);
			expect(commands.some((c) => c.includes("INSERT INTO migrations"))).toBe(
				true
			);
		});

		it("applies a mix of top-level .sql and directory migrations", async () => {
			setIsTTY(false);
			const commands: string[] = [];

			msw.use(
				http.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async (req) => {
						const { body } = req.request;
						if (body && typeof body === "object") {
							commands.push(JSON.stringify(body));
						} else {
							commands.push(String(body));
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
				)
			);

			msw.use(
				http.get("*/accounts/:accountId/d1/database/:databaseId", async () => {
					return HttpResponse.json(
						{
							result: {
								file_size: 123,
								name: "testdb",
								num_tables: 0,
								uuid: "uuid",
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
						migrations_dir: "migrations",
					},
				],
				account_id: "nx01",
			});

			mockGetMemberships([
				{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
				{ id: "R2-D2", account: { id: "nx01", name: "enterprise-nx" } },
			]);

			// Create top-level migration file and a migration directory
			fs.mkdirSync("migrations/002_complex", { recursive: true });
			fs.writeFileSync(
				"migrations/001_init.sql",
				"CREATE TABLE top (id INTEGER PRIMARY KEY);"
			);
			fs.writeFileSync(
				"migrations/002_complex/01_schema.sql",
				"CREATE TABLE users (id INTEGER PRIMARY KEY);"
			);
			fs.writeFileSync(
				"migrations/002_complex/02_seed.sql",
				"INSERT INTO users (id) VALUES (1);"
			);

			mockConfirm({
				text: `About to apply 2 migration(s)\nYour database may not be available to serve requests during the migration, continue?`,
				result: true,
			});

			await runWrangler("d1 migrations apply db --remote");

			expect(commands.some((c) => c.includes("CREATE TABLE top"))).toBe(true);
			expect(commands.some((c) => c.includes("CREATE TABLE users"))).toBe(true);
			expect(
				commands.filter((c) => c.includes("INSERT INTO migrations")).length
			).toBe(2);
		});
	});

	describe("list", () => {
		mockAccountId();
		mockApiToken({ apiToken: null });

		it("should not attempt to login in local mode", async () => {
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

		it("should use the custom migrations folder when provided", async () => {
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

		it("should try to read D1 config from wrangler.toml when logged in", async () => {
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

		it("should throw if user is not authenticated and not using --local", async () => {
			setIsTTY(false);

			await expect(
				runWrangler("d1 migrations list DATABASE --remote")
			).rejects.toThrowError(
				"In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work"
			);
		});

		it("should not try to read wrangler.toml in local mode", async () => {
			setIsTTY(false);
			writeWranglerConfig();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(
				runWrangler("d1 migrations list DATABASE")
			).rejects.toThrowError(`No migrations present at <cwd>/migrations.`);
		});
	});
});
