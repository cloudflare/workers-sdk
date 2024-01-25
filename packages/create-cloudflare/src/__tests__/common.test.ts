import * as command from "helpers/command";
import { SemVer } from "semver";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { version as currentVersion } from "../../package.json";
import {
	isAllowedExistingFile,
	isGitConfigured,
	quoteShellArgs,
	validateProjectDirectory,
} from "../common";
import { isUpdateAvailable } from "../helpers/cli";

vi.mock("process");

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

describe("isUpdateAvailable", () => {
	const originalDispatcher = getGlobalDispatcher();
	let agent: MockAgent;

	beforeEach(() => {
		// Mock out the undici Agent
		agent = new MockAgent();
		agent.disableNetConnect();
		setGlobalDispatcher(agent);
	});

	afterEach(() => {
		agent.assertNoPendingInterceptors();
		setGlobalDispatcher(originalDispatcher);
	});

	test("is not available if fetch fails", async () => {
		agent
			.get("https://registry.npmjs.org")
			.intercept({ path: "/create-cloudflare" })
			.replyWithError(new Error());
		expect(await isUpdateAvailable()).toBe(false);
	});

	test("is not available if fetched latest version is older by a minor", async () => {
		const latestVersion = new SemVer(currentVersion);
		latestVersion.minor--;
		replyWithLatest(latestVersion);
		expect(await isUpdateAvailable()).toBe(false);
	});

	test("is available if fetched latest version is newer by a minor", async () => {
		const latestVersion = new SemVer(currentVersion);
		latestVersion.minor++;
		replyWithLatest(latestVersion);
		expect(await isUpdateAvailable()).toBe(true);
	});

	test("is not available if fetched latest version is newer by a major", async () => {
		const latestVersion = new SemVer(currentVersion);
		latestVersion.major++;
		replyWithLatest(latestVersion);
		expect(await isUpdateAvailable()).toBe(false);
	});

	function replyWithLatest(version: SemVer) {
		agent
			.get("https://registry.npmjs.org")
			.intercept({ path: "/create-cloudflare" })
			.reply(
				200,
				{
					"dist-tags": { latest: version.format() },
				},
				{
					headers: { "content-type": "application/json" },
				}
			);
	}
});

describe("quoteShellArgs", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("mac", async () => {
		Object.defineProperty(vi.mocked(process), "platform", { value: "darwin" });
		expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
		expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`'24.02 foo-bar'`);
		expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
			`'foo/10 bar/20-baz/'`
		);
	});

	test("windows", async () => {
		Object.defineProperty(vi.mocked(process), "platform", { value: "win32" });
		expect(quoteShellArgs([`pages:dev`])).toEqual("pages:dev");
		expect(quoteShellArgs([`24.02 foo-bar`])).toEqual(`"24.02 foo-bar"`);
		expect(quoteShellArgs([`foo/10 bar/20-baz/`])).toEqual(
			`"foo/10 bar/20-baz/"`
		);
	});
});
