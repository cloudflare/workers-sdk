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
import { runTriangle } from "../helpers/run-triangle";
import writeTriangleToml from "../helpers/write-triangle-toml";

describe("migrate", () => {
	runInTempDir();
	mockConsoleMethods();
	mockSetTimeout();

	const { setIsTTY } = useMockIsTTY();

	describe("create", () => {
		it("should reject the --local flag for create", async () => {
			setIsTTY(false);
			writeTriangleToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});

			await expect(
				runTriangle("d1 migrations create test some-message --local DATABASE")
			).rejects.toThrowError(`Unknown argument: local`);
		});
	});

	describe("apply", () => {
		mockAccountId({ accountId: null });
		mockApiToken();
		const { mockOAuthServerCallback } = mockOAuthFlow();
		it("should not attempt to login in local mode", async () => {
			setIsTTY(false);
			writeTriangleToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			// If we get to the point where we are checking for migrations then we have not been asked to log in.
			await expect(
				runTriangle("d1 migrations apply --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});

		it("should try to read D1 config from triangle.toml", async () => {
			setIsTTY(false);
			writeTriangleToml();
			await expect(
				runTriangle("d1 migrations apply DATABASE")
			).rejects.toThrowError(
				"Can't find a DB with name/binding 'DATABASE' in local config. Check info in triangle.toml..."
			);
		});

		it("should not try to read triangle.toml in local mode", async () => {
			setIsTTY(false);
			writeTriangleToml();
			// If we get to the point where we are checking for migrations then we have not checked triangle.toml.
			await expect(
				runTriangle("d1 migrations apply --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});

		it("should reject the use of --preview with --local", async () => {
			setIsTTY(false);
			writeTriangleToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			await runTriangle("d1 migrations create db test");

			await expect(
				runTriangle("d1 migrations apply --local db --preview")
			).rejects.toThrowError(`Error: can't use --preview with --local`);
		});

		it("multiple accounts: should throw when trying to apply migrations without an account_id in config", async () => {
			setIsTTY(false);

			writeTriangleToml({
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
			await runTriangle("d1 migrations create db test");
			mockConfirm({
				text: `About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});
			await expect(runTriangle("d1 migrations apply db")).rejects.toThrowError(
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
			writeTriangleToml({
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
			await runTriangle("d1 migrations create db test");
			mockConfirm({
				text: `About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?`,
				result: true,
			});
			//if we get to this point, triangle knows the account_id
			await expect(runTriangle("d1 migrations apply db")).rejects.toThrowError(
				`request to https://api.cloudflare.com/client/v4/accounts/nx01/d1/database/xxxx/backup failed`
			);
		});
	});

	describe("list", () => {
		mockAccountId();
		mockApiToken({ apiToken: null });

		it("should not attempt to login in local mode", async () => {
			setIsTTY(false);
			writeTriangleToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			// If we get to the point where we are checking for migrations then we have not been asked to log in.
			await expect(
				runTriangle("d1 migrations list --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});

		it("should use the custom migrations folder when provided", async () => {
			setIsTTY(false);
			writeTriangleToml({
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
				runTriangle("d1 migrations list --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll(
					"\\",
					"/"
				)}/my-migrations-go-here.`
			);
		});

		it("should try to read D1 config from triangle.toml when logged in", async () => {
			// no need to clear this env var as it's implicitly cleared by mockApiToken in afterEach
			process.env.CLOUDFLARE_API_TOKEN = "api-token";
			reinitialiseAuthTokens();
			setIsTTY(false);
			writeTriangleToml();
			await expect(
				runTriangle("d1 migrations list DATABASE")
			).rejects.toThrowError(
				"Can't find a DB with name/binding 'DATABASE' in local config. Check info in triangle.toml..."
			);
		});

		it("should throw if user is not authenticated and not using --local", async () => {
			setIsTTY(false);

			await expect(
				runTriangle("d1 migrations list DATABASE")
			).rejects.toThrowError(
				"In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for triangle to work"
			);
		});

		it("should not try to read triangle.toml in local mode", async () => {
			setIsTTY(false);
			writeTriangleToml();
			// If we get to the point where we are checking for migrations then we have not checked triangle.toml.
			await expect(
				runTriangle("d1 migrations list --local DATABASE")
			).rejects.toThrowError(
				`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
			);
		});
	});
});
