import { runCommand } from "helpers/command";
import { describe, expect, test, vi } from "vitest";
import { isGitConfigured, isGitInstalled } from "../git";

vi.mock("helpers/command");

describe("git helpers", () => {
	describe("isGitConfigured", () => {
		test("fully configured", async () => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("email") ? "test@user.com" : "test user")
			);

			expect(await isGitConfigured()).toBe(true);
		});

		test("no name", async () => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("email") ? "test@user.com" : "")
			);
			expect(await isGitConfigured()).toBe(false);
		});

		test("no email", async () => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("name") ? "test user" : "")
			);
			expect(await isGitConfigured()).toBe(false);
		});

		test("runCommand fails", async () => {
			vi.mocked(runCommand).mockRejectedValue(new Error("git not found"));
			expect(await isGitConfigured()).toBe(false);
		});
	});

	describe("isGitInstalled", async () => {
		test("installed", async () => {
			vi.mocked(runCommand).mockImplementation(() =>
				Promise.resolve("git version 2.20.2 (Apple Git-100)")
			);
			expect(await isGitInstalled()).toBe(true);
		});

		test("not installed", async () => {
			vi.mocked(runCommand).mockImplementation(() =>
				Promise.reject(new Error("zsh: command not found: git"))
			);
			expect(await isGitInstalled()).toBe(false);
		});
	});
});
