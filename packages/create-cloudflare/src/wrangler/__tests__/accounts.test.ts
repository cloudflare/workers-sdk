import { mockPackageManager, mockSpinner } from "helpers/__tests__/mocks";
import { runCommand } from "helpers/command";
import { hasSparrowSourceKey } from "helpers/sparrow";
import { beforeEach, describe, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import {
	chooseAccount,
	isLoggedIn,
	listAccounts,
	wranglerLogin,
} from "../accounts";

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

vi.mock("helpers/command");
vi.mock("helpers/sparrow");
vi.mock("which-pm-runs");
vi.mock("@cloudflare/cli/interactive");

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
			expect(runCommand).not.toHaveBeenCalled();
		});
	});

	describe("wranglerLogin", async () => {
		test("logged in", async ({ expect }) => {
			const mock = vi
				.mocked(runCommand)
				.mockReturnValueOnce(Promise.resolve(loggedInWhoamiOutput));

			const loggedIn = await wranglerLogin(ctx);

			expect(loggedIn).toBe(true);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything(),
			);
			expect(mock).not.toHaveBeenCalledWith(
				["npx", "wrangler", "login"],
				expect.anything(),
			);
			expect(spinner.start).toHaveBeenCalledOnce();
			expect(spinner.stop).toHaveBeenCalledOnce();
		});

		test("logged out (successful login)", async ({ expect }) => {
			const mock = vi
				.mocked(runCommand)
				.mockReturnValueOnce(Promise.resolve(loggedOutWhoamiOutput))
				.mockReturnValueOnce(Promise.resolve(loginSuccessOutput));

			const loggedIn = await wranglerLogin(ctx);

			expect(loggedIn).toBe(true);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything(),
			);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "login"],
				expect.anything(),
			);
			expect(spinner.start).toHaveBeenCalledTimes(2);
			expect(spinner.stop).toHaveBeenCalledTimes(2);
		});

		test("logged out (login denied)", async ({ expect }) => {
			const mock = vi
				.mocked(runCommand)
				.mockReturnValueOnce(Promise.resolve(loggedOutWhoamiOutput))
				.mockReturnValueOnce(Promise.resolve(loginDeniedOutput));

			const loggedIn = await wranglerLogin(ctx);

			expect(loggedIn).toBe(false);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything(),
			);
			expect(mock).toHaveBeenCalledWith(
				["npx", "wrangler", "login"],
				expect.anything(),
			);
			expect(spinner.start).toHaveBeenCalledTimes(2);
			expect(spinner.stop).toHaveBeenCalledTimes(2);
		});
	});

	test("listAccounts", async ({ expect }) => {
		const mock = vi
			.mocked(runCommand)
			.mockReturnValueOnce(Promise.resolve(loggedInWhoamiOutput));

		const accounts = await listAccounts();
		expect(accounts).keys("testacct");
		expect(mock).toHaveBeenLastCalledWith(
			["npx", "wrangler", "whoami"],
			expect.anything(),
		);
	});

	describe("isLoggedIn", async () => {
		test("logged in", async ({ expect }) => {
			const mock = vi
				.mocked(runCommand)
				.mockReturnValueOnce(Promise.resolve(loggedInWhoamiOutput));

			const result = await isLoggedIn();

			expect(result).toBe(true);
			expect(mock).toHaveBeenLastCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything(),
			);
		});

		test("logged out", async ({ expect }) => {
			const mock = vi
				.mocked(runCommand)
				.mockReturnValueOnce(Promise.resolve(loggedOutWhoamiOutput));

			const result = await isLoggedIn();

			expect(result).toBe(false);
			expect(mock).toHaveBeenLastCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything(),
			);
		});

		test("wrangler whoami error", async ({ expect }) => {
			const mock = vi
				.mocked(runCommand)
				.mockRejectedValueOnce(new Error("fail!"));

			const result = await isLoggedIn();

			expect(result).toBe(false);
			expect(mock).toHaveBeenLastCalledWith(
				["npx", "wrangler", "whoami"],
				expect.anything(),
			);
		});
	});
});
