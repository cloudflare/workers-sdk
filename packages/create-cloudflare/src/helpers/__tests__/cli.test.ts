import { spinner } from "@cloudflare/cli/interactive";
import { SemVer } from "semver";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { version as currentVersion } from "../../../package.json";
import { isUpdateAvailable } from "../cli";

vi.mock("process");
vi.mock("@cloudflare/cli/interactive");

beforeEach(() => {
	// we mock `spinner` to remove noisy logs from the test runs
	vi.mocked(spinner).mockImplementation(() => ({
		start() {},
		update() {},
		stop() {},
	}));
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
