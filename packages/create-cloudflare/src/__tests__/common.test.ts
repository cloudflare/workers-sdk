import * as command from "helpers/command";
import { describe, expect, test, vi } from "vitest";
import { isGitConfigured } from "../common";

function promisify<T>(value: T) {
	return new Promise<T>((res) => res(value));
}

describe("isGitConfigured", () => {
	test("fully configured", async () => {
		const spy = vi.spyOn(command, "runCommand");
		spy.mockImplementation((cmd) =>
			promisify(cmd.includes("email") ? "test@user.com" : "test user")
		);
		expect(await isGitConfigured()).toBe(true);
	});

	test("no name", async () => {
		const spy = vi.spyOn(command, "runCommand");
		spy.mockImplementation((cmd) =>
			promisify(cmd.includes("email") ? "test@user.com" : "")
		);
		expect(await isGitConfigured()).toBe(false);
	});

	test("no email", async () => {
		const spy = vi.spyOn(command, "runCommand");
		spy.mockImplementation((cmd) =>
			promisify(cmd.includes("name") ? "test user" : "")
		);
		expect(await isGitConfigured()).toBe(false);
	});

	test("runCommand fails", async () => {
		const spy = vi.spyOn(command, "runCommand");
		spy.mockImplementation(() => {
			throw new Error("git not found");
		});
		expect(await isGitConfigured()).toBe(false);
	});
});
