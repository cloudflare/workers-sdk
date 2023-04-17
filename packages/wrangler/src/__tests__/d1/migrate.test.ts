import { cwd } from "process";
import { rest } from "msw";
import { reinitialiseAuthTokens } from "../../user";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships, mockOAuthFlow } from "../helpers/mock-oauth-flow";
import { mockSetTimeout } from "../helpers/mock-set-timeout";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("migrate", () => {
	runInTempDir();
	mockConsoleMethods();
	mockSetTimeout();

	const { setIsTTY } = useMockIsTTY();

	describe("create", () => {
		it("should reject the --local flag for create", async () => {
			setIsTTY(false);
			writeWranglerToml({
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
		const { mockOAuthServerCallback } = mockOAuthFlow();
		it("should not attempt to login in local mode", async () => {
			setIsTTY(false);
			writeWranglerToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			// If we get to the point where we are checking for migrations then we have not been asked to log in.
			await expect(
				runWrangler("d1 migrations apply --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});

		it("should try to read D1 config from wrangler.toml", async () => {
			setIsTTY(false);
			writeWranglerToml();
			await expect(
				runWrangler("d1 migrations apply DATABASE")
			).rejects.toThrowError(
				"Can't find a DB with name/binding 'DATABASE' in local config. Check info in wrangler.toml..."
			);
		});

		it("should not try to read wrangler.toml in local mode", async () => {
			setIsTTY(false);
			writeWranglerToml();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(
				runWrangler("d1 migrations apply --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});

		it("should reject the use of --preview with --local", async () => {
			setIsTTY(false);
			writeWranglerToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			await runWrangler("d1 migrations create db test");

			await expect(
				runWrangler("d1 migrations apply --local db --preview")
			).rejects.toThrowError(`Error: can't use --preview with --local`);
		});

		it("multiple accounts: should throw when trying to apply migrations without an account_id in config", async () => {
			setIsTTY(false);

			writeWranglerToml({
				d1_databases: [
					{
						binding: "DATABASE",
						database_name: "db",
						database_id: "xxxx",
						migrations_dir: "/tmp/my-migrations-go-here",
					},
				],
			});
			mockOAuthServerCallback();
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
			await expect(runWrangler("d1 migrations apply db")).rejects.toThrowError(
				`More than one account available but unable to select one in non-interactive mode.`
			);
		});
		it("multiple accounts: should let the user apply migrations with an account_id in config", async () => {
			setIsTTY(false);
			msw.use(
				rest.post(
					"*/accounts/:accountId/d1/database/:databaseId/query",
					async (req, res, ctx) => {
						return res(
							ctx.status(200),
							ctx.json({
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
							})
						);
					}
				)
			);
			writeWranglerToml({
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
			mockOAuthServerCallback();
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
			//if we get to this point, wrangler knows the account_id
			await expect(runWrangler("d1 migrations apply db")).rejects.toThrowError(
				`request to https://api.cloudflare.com/client/v4/accounts/nx01/d1/database/xxxx/backup failed`
			);
		});
	});

	describe("list", () => {
		mockAccountId();
		mockApiToken({ apiToken: null });

		it("should not attempt to login in local mode", async () => {
			setIsTTY(false);
			writeWranglerToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			// If we get to the point where we are checking for migrations then we have not been asked to log in.
			await expect(
				runWrangler("d1 migrations list --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});

		it("should use the custom migrations folder when provided", async () => {
			setIsTTY(false);
			writeWranglerToml({
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
				`No migrations present at ${cwd().replaceAll(
					"\\",
					"/"
				)}/my-migrations-go-here.`
			);
		});

		it("should try to read D1 config from wrangler.toml when logged in", async () => {
			// no need to clear this env var as it's implicitly cleared by mockApiToken in afterEach
			process.env.CLOUDFLARE_API_TOKEN = "api-token";
			reinitialiseAuthTokens();
			setIsTTY(false);
			writeWranglerToml();
			await expect(
				runWrangler("d1 migrations list DATABASE")
			).rejects.toThrowError(
				"Can't find a DB with name/binding 'DATABASE' in local config. Check info in wrangler.toml..."
			);
		});

		it("should throw if user is not authenticated and not using --local", async () => {
			setIsTTY(false);

			await expect(
				runWrangler("d1 migrations list DATABASE")
			).rejects.toThrowError(
				"In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work"
			);
		});

		it("should not try to read wrangler.toml in local mode", async () => {
			setIsTTY(false);
			writeWranglerToml();
			// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
			await expect(
				runWrangler("d1 migrations list --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});
	});
});
