import { CancelError } from "@cloudflare/cli-shared-helpers/error";
import { mockPackageManager } from "helpers/__tests__/mocks";
import { runWranglerCommand } from "helpers/command";
import { beforeEach, describe, test, vi } from "vitest";
import { isLoggedIn, listAccounts, login } from "../accounts";

const loggedInWhoamiOutput = JSON.stringify({
	authenticated: true,
	tokenValid: true,
	accounts: [{ id: "g8s9dl23jv90xa0xxxx990ds09xxxxda", name: "testacct" }],
});

const loggedOutWhoamiOutput = JSON.stringify({
	authenticated: false,
	error: "Not logged in",
});

const invalidTokenWhoamiOutput = JSON.stringify({
	authenticated: true,
	tokenValid: false,
	accounts: [],
});

vi.mock("helpers/command");
vi.mock("which-pm-runs");

describe("cf account helpers", () => {
	beforeEach(() => {
		mockPackageManager("npm");
	});

	describe("isLoggedIn", () => {
		test("logged in", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(loggedInWhoamiOutput);

			await expect(isLoggedIn()).resolves.toBe(true);
			expect(runWranglerCommand).toHaveBeenCalledWith(
				["npx", "cf", "auth", "whoami"],
				expect.anything()
			);
		});

		test("logged out", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				loggedOutWhoamiOutput
			);

			await expect(isLoggedIn()).resolves.toBe(false);
		});

		test("invalid token", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				invalidTokenWhoamiOutput
			);

			await expect(isLoggedIn()).resolves.toBe(false);
		});

		test("ignores output around the JSON", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				`A new version of cf is available\n${loggedInWhoamiOutput}\n`
			);

			await expect(isLoggedIn()).resolves.toBe(true);
		});

		test("cf auth whoami error", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockRejectedValueOnce(new Error("fail!"));

			await expect(isLoggedIn()).resolves.toBe(false);
		});
	});

	test("listAccounts", async ({ expect }) => {
		vi.mocked(runWranglerCommand).mockResolvedValueOnce(loggedInWhoamiOutput);

		await expect(listAccounts()).resolves.toEqual({
			testacct: "g8s9dl23jv90xa0xxxx990ds09xxxxda",
		});
	});

	describe("login", () => {
		test("successful login", async ({ expect }) => {
			vi.mocked(runWranglerCommand)
				.mockResolvedValueOnce("")
				.mockResolvedValueOnce(loggedInWhoamiOutput);

			await expect(login()).resolves.toBe(true);
			// Not silent, so that the user can see the device authorization code
			expect(runWranglerCommand).toHaveBeenCalledWith([
				"npx",
				"cf",
				"auth",
				"login",
			]);
		});

		test("failed login", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockRejectedValueOnce(new Error("fail!"));

			await expect(login()).resolves.toBe(false);
		});

		test("cancelled login", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockRejectedValueOnce(
				new CancelError("Command cancelled")
			);

			await expect(login()).rejects.toThrow(CancelError);
		});

		test("still logged out after login", async ({ expect }) => {
			vi.mocked(runWranglerCommand)
				.mockResolvedValueOnce("")
				.mockResolvedValueOnce(loggedOutWhoamiOutput);

			await expect(login()).resolves.toBe(false);
		});
	});
});
