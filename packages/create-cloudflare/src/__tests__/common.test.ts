import * as command from "helpers/command";
import { describe, expect, test, vi } from "vitest";
import {
	isAllowedExistingFile,
	isGitConfigured,
	validateProjectDirectory,
} from "../common";

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
	let args = {};

	test("allow valid project names", async () => {
		expect(validateProjectDirectory("foo", args)).toBeUndefined();
		expect(validateProjectDirectory("foo/bar/baz", args)).toBeUndefined();
		expect(validateProjectDirectory("./foobar", args)).toBeUndefined();
		expect(validateProjectDirectory("f".repeat(58), args)).toBeUndefined();
	});

	test("disallow invalid project names", async () => {
		// Invalid pages project names should return an error
		expect(validateProjectDirectory("foobar-", args)).not.toBeUndefined();
		expect(validateProjectDirectory("-foobar-", args)).not.toBeUndefined();
		expect(validateProjectDirectory("fo*o{ba)r", args)).not.toBeUndefined();
		expect(validateProjectDirectory("f".repeat(59), args)).not.toBeUndefined();
	});

	test("disallow existing, non-empty directories", async () => {
		// Existing, non-empty directories should return an error
		expect(validateProjectDirectory(".", args)).not.toBeUndefined();
	});

	test("Relax validation when --existing-script is passed", async () => {
		args = { existingScript: "FooBar" };
		expect(validateProjectDirectory("foobar-", args)).toBeUndefined();
		expect(validateProjectDirectory("FooBar", args)).toBeUndefined();
		expect(validateProjectDirectory("f".repeat(59), args)).toBeUndefined();
	});
});

describe("isAllowedExistingFile", () => {
	const allowed = [
		"LICENSE",
		"LICENSE.md",
		"license",
		".npmignore",
		".git",
		".DS_Store",
	];
	test.each(allowed)("%s", (val) => {
		expect(isAllowedExistingFile(val)).toBe(true);
	});

	const disallowed = ["foobar", "potato"];
	test.each(disallowed)("%s", (val) => {
		expect(isAllowedExistingFile(val)).toBe(false);
	});
});
