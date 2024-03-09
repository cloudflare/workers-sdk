import { spinner } from "@cloudflare/cli/interactive";
import * as command from "helpers/command";
import { SemVer } from "semver";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { version as currentVersion } from "../../package.json";
import { isGitConfigured } from "../common";
import { isUpdateAvailable } from "../helpers/cli";

vi.mock("process");
vi.mock("@cloudflare/cli/interactive");

function promisify<T>(value: T) {
	return new Promise<T>((res) => res(value));
}

beforeEach(() => {
	// we mock `spinner` to remove noisy logs from the test runs
	vi.mocked(spinner).mockImplementation(() => ({
		start() {},
		update() {},
		stop() {},
	}));
});

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
