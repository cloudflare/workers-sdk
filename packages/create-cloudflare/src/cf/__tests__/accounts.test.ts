import { mockPackageManager } from "helpers/__tests__/mocks";
import { runWranglerCommand } from "helpers/command";
import { beforeEach, describe, test, vi } from "vitest";
import { cfLogin, isLoggedInWithCf, listCfAccounts } from "../accounts";

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

	describe("isLoggedInWithCf", () => {
		test("logged in", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(loggedInWhoamiOutput);

			await expect(isLoggedInWithCf()).resolves.toBe(true);
			expect(runWranglerCommand).toHaveBeenCalledWith(
				["npx", "cf", "auth", "whoami"],
				expect.anything()
			);
		});

		test("logged out", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				loggedOutWhoamiOutput
			);

			await expect(isLoggedInWithCf()).resolves.toBe(false);
		});

		test("invalid token", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				invalidTokenWhoamiOutput
			);

			await expect(isLoggedInWithCf()).resolves.toBe(false);
		});

		test("ignores output around the JSON", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockResolvedValueOnce(
				`A new version of cf is available\n${loggedInWhoamiOutput}\n`
			);

			await expect(isLoggedInWithCf()).resolves.toBe(true);
		});

		test("cf auth whoami error", async ({ expect }) => {
			vi.mocked(runWranglerCommand).mockRejectedValueOnce(new Error("fail!"));

			await expect(isLoggedInWithCf()).resolves.toBe(false);
		});
	});

	test("listCfAccounts", async ({ expect }) => {
		vi.mocked(runWranglerCommand).mockResolvedValueOnce(loggedInWhoamiOutput);

		await expect(listCfAccounts()).resolves.toEqual({
			testacct: "g8s9dl23jv90xa0xxxx990ds09xxxxda",
		});
	});

	describe("cfLogin", () => {
		test("successful login", async ({ expect }) => {
			vi.mocked(runWranglerCommand)
				.mockResolvedValueOnce("")
				.mockResolvedValueOnce(loggedInWhoamiOutput);

			await expect(cfLogin()).resolves.toBe(true);
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

			await expect(cfLogin()).resolves.toBe(false);
		});

		test("still logged out after login", async ({ expect }) => {
			vi.mocked(runWranglerCommand)
				.mockResolvedValueOnce("")
				.mockResolvedValueOnce(loggedOutWhoamiOutput);

			await expect(cfLogin()).resolves.toBe(false);
		});
	});
});
