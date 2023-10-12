import * as command from "helpers/command";
import { describe, expect, test, vi } from "vitest";
import { isGitConfigured } from "../common";
import { validateProjectDirectory } from "../common";

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

describe("validateProjectDirectory", () => {
	test("allow valid project names", async () => {
		expect(validateProjectDirectory("foo")).toBeUndefined();
		expect(validateProjectDirectory("foo/bar/baz")).toBeUndefined();
		expect(validateProjectDirectory("./foobar")).toBeUndefined();
		expect(validateProjectDirectory("f".repeat(58))).toBeUndefined();
	});

	test("disallow invalid project names", async () => {
		// Invalid pages project names should return an error
		expect(validateProjectDirectory("foobar-")).not.toBeUndefined();
		expect(validateProjectDirectory("-foobar-")).not.toBeUndefined();
		expect(validateProjectDirectory("fo*o{ba)r")).not.toBeUndefined();
		expect(validateProjectDirectory("f".repeat(59))).not.toBeUndefined();
	});

	test("disallow existing, non-empty directories", async () => {
		// Existing, non-empty directories should return an error
		expect(validateProjectDirectory(".")).not.toBeUndefined();
	});
});
