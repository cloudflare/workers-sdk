import { mockPackageManager, mockSpinner } from "helpers/__tests__/mocks";
import { runWranglerCommand } from "helpers/command";
import { hasSparrowSourceKey } from "helpers/sparrow";
import { beforeEach, describe, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { usesCfCli } from "../../cf/config";
import { chooseAccount, isLoggedIn, listAccounts, login } from "../accounts";

const loggedInWhoamiOutput = `
-------------------------------------------------------
Getting User settings...
👋 You are logged in with an OAuth Token, associated with the email person@mail.com!
┌──────────────┬──────────────────────────────────┐
│ Account Name │ Account ID                       │
├──────────────┼──────────────────────────────────┤
│ testacct     │ g8s9dl23jv90xa0xxxx990ds09xxxxda │
└──────────────┴──────────────────────────────────┘
`;

const loggedOutWhoamiOutput = `
-------------------
Getting User settings...
You are not authenticated. Please run \`wrangler login\`.
`;

const loginDeniedOutput = `
✘ [ERROR] Error: Consent denied. You must grant consent to Wrangler in order to login.
`;

const loginSuccessOutput = `
Successfully logged in.
`;

const cfLoggedInWhoamiOutput = JSON.stringify({
	authenticated: true,
	tokenValid: true,
	accounts: [{ id: "g8s9dl23jv90xa0xxxx990ds09xxxxda", name: "testacct" }],
});

const cfLoggedOutWhoamiOutput = JSON.stringify({
	authenticated: false,
	error: "Not logged in",
});

vi.mock("helpers/command");
vi.mock("helpers/sparrow");
vi.mock("../../cf/config");
vi.mock("which-pm-runs");
vi.mock("@cloudflare/cli-shared-helpers/interactive");

describe("wrangler account helpers", () => {
	const ctx = createTestContext();

	let spinner: ReturnType<typeof mockSpinner>;

	beforeEach(() => {
		mockPackageManager("npm");
		vi.mocked(hasSparrowSourceKey).mockReturnValue(true);

		spinner = mockSpinner();
	});

	describe("chooseAccount", () => {
		test("uses CLOUDFLARE_ACCOUNT_ID from environment if set", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-account-id-123");

			const testCtx = createTestContext();
			await chooseAccount(testCtx);

			expect(testCtx.account).toEqual({ id: "env-account-id-123", name: "" });
			// Should not call wrangler whoami when env var is set
			expect(runWranglerCommand).not.toHaveBeenCalled();
		});

		test("lists accounts with cf for cf projects", async ({ expect }) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
			vi.mocked(usesCfCli).mockReturnValue(true);
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				cfLoggedInWhoamiOutput
			);

			const testCtx = createTestContext();
			await chooseAccount(testCtx);

			expect(testCtx.account).toEqual({
				id: "g8s9dl23jv90xa0xxxx990ds09xxxxda",
				name: "testacct",
			});
			expect(runWranglerCommand).toHaveBeenCalledWith(
				["npx", "cf", "auth", "whoami"],
				expect.anything()
			);
		});
	});

	describe("login", async () => {
		test("logged in", async ({ expect }) => {
			const mock = vi
				.mocked(runWranglerCommand)
				.mockReturnValueOnce(Promise.resolve(loggedInWhoamiOutput));

			const loggedIn = await login(ctx);

			expect(loggedIn).toBe(true);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything()
			);
			expect(mock).not.toHaveBeenCalledWith(
				["npx", "wrangler", "login"],
				expect.anything()
			);
			expect(spinner.start).toHaveBeenCalledOnce();
			expect(spinner.stop).toHaveBeenCalledOnce();
		});

		test("logged out (successful login)", async ({ expect }) => {
			const mock = vi
				.mocked(runWranglerCommand)
				.mockReturnValueOnce(Promise.resolve(loggedOutWhoamiOutput))
				.mockReturnValueOnce(Promise.resolve(loginSuccessOutput));

			const loggedIn = await login(ctx);

			expect(loggedIn).toBe(true);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything()
			);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "login"],
				expect.anything()
			);
			expect(spinner.start).toHaveBeenCalledTimes(2);
			expect(spinner.stop).toHaveBeenCalledTimes(2);
		});

		test("logged out (login denied)", async ({ expect }) => {
			const mock = vi
				.mocked(runWranglerCommand)
				.mockReturnValueOnce(Promise.resolve(loggedOutWhoamiOutput))
				.mockReturnValueOnce(Promise.resolve(loginDeniedOutput));

			const loggedIn = await login(ctx);

			expect(loggedIn).toBe(false);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything()
			);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "login"],
				expect.anything()
			);
			expect(spinner.start).toHaveBeenCalledTimes(2);
			expect(spinner.stop).toHaveBeenCalledTimes(2);
		});
	});

	describe("login (cf)", () => {
		beforeEach(() => {
			vi.mocked(usesCfCli).mockReturnValue(true);
		});

		test("logged in", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				cfLoggedInWhoamiOutput
			);

			await expect(login(ctx)).resolves.toBe(true);
			expect(runWranglerCommand).toHaveBeenCalledOnce();
			expect(runWranglerCommand).toHaveBeenCalledWith(
				["npx", "cf", "auth", "whoami"],
				expect.anything()
			);
		});

		test("logged out (successful login)", async ({ expect }) => {
			vi.mocked(runWranglerCommand)
				.mockResolvedValueOnce(cfLoggedOutWhoamiOutput)
				.mockResolvedValueOnce("")
				.mockResolvedValueOnce(cfLoggedInWhoamiOutput);

			await expect(login(ctx)).resolves.toBe(true);
			expect(runWranglerCommand).toHaveBeenCalledWith([
				"npx",
				"cf",
				"auth",
				"login",
				"--force",
			]);
			expect(runWranglerCommand).not.toHaveBeenCalledWith(
				["npx", "wrangler", "login"],
				expect.anything()
			);
		});

		test("logged out (login failed)", async ({ expect }) => {
			vi.mocked(runWranglerCommand)
				.mockResolvedValueOnce(cfLoggedOutWhoamiOutput)
				.mockRejectedValueOnce(new Error("fail!"));

			await expect(login(ctx)).resolves.toBe(false);
		});
	});

	test("listAccounts", async ({ expect }) => {
		const mock = vi
			.mocked(runWranglerCommand)
			.mockReturnValueOnce(Promise.resolve(loggedInWhoamiOutput));

		const accounts = await listAccounts();
		expect(accounts).keys("testacct");
		expect(mock).toHaveBeenLastCalledWith(
			["npx", "wrangler", "whoami"],
			expect.anything()
		);
	});

	describe("isLoggedIn", async () => {
		test("logged in", async ({ expect }) => {
			const mock = vi
				.mocked(runWranglerCommand)
				.mockReturnValueOnce(Promise.resolve(loggedInWhoamiOutput));

			const result = await isLoggedIn();

			expect(result).toBe(true);
			expect(mock).toHaveBeenLastCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything()
			);
		});

		test("logged out", async ({ expect }) => {
			const mock = vi
				.mocked(runWranglerCommand)
				.mockReturnValueOnce(Promise.resolve(loggedOutWhoamiOutput));

			const result = await isLoggedIn();

			expect(result).toBe(false);
			expect(mock).toHaveBeenLastCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything()
			);
		});

		test("wrangler whoami error", async ({ expect }) => {
			const mock = vi
				.mocked(runWranglerCommand)
				.mockRejectedValueOnce(new Error("fail!"));

			const result = await isLoggedIn();

			expect(result).toBe(false);
			expect(mock).toHaveBeenLastCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything()
			);
		});
	});
});
