import { seed } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, test, vi } from "vitest";
import { installCloudflareSkillsGlobally } from "../agents-skills-install";
import { sendMetricsEvent } from "../metrics/send-event";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type * as SendEventModule from "../metrics/send-event";

// The global vitest.setup.ts mock for installCloudflareSkillsGlobally is active
// (returns { skipped: true, reason: "Already prompted" }), so we can spy on it
// without making real network calls.

vi.mock("../metrics/send-event", async (importOriginal) => {
	const original = await importOriginal<typeof SendEventModule>();
	return {
		...original,
		sendMetricsEvent: vi.fn(),
	};
});

vi.mock("../package-manager", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		getPackageManager() {
			return {
				type: "npm",
				npx: "npx",
			};
		},
	};
});

describe("register-yargs-command skills integration", () => {
	runInTempDir();
	mockConsoleMethods();

	beforeEach(async () => {
		// Seed a wrangler config so `wrangler setup` skips autoconfig and
		// returns quickly — we only care about the skills install call.
		await seed({
			"wrangler.jsonc": JSON.stringify({ name: "test-worker" }),
		});
	});

	test("calls installCloudflareSkillsGlobally with false by default", async ({
		expect,
	}) => {
		await runWrangler("setup");

		expect(installCloudflareSkillsGlobally).toHaveBeenCalledWith(false);
	});

	test("calls installCloudflareSkillsGlobally with true when --x-force-skills-install is passed", async ({
		expect,
	}) => {
		await runWrangler("setup --x-force-skills-install");

		expect(installCloudflareSkillsGlobally).toHaveBeenCalledWith(true);
	});

	test("does not send skills_install metrics when result is 'Already prompted'", async ({
		expect,
	}) => {
		// The global mock returns { skipped: true, reason: "Already prompted" }
		await runWrangler("setup");

		const metricsCalls = vi
			.mocked(sendMetricsEvent)
			.mock.calls.filter(
				([event]) =>
					event === "skills_install_skipped" ||
					event === "skills_install_completed"
			);

		expect(metricsCalls).toHaveLength(0);
	});

	test("sends skills_install_skipped metric for non-'Already prompted' skip reasons", async ({
		expect,
	}) => {
		vi.mocked(installCloudflareSkillsGlobally).mockResolvedValueOnce({
			skipped: true,
			reason: "No supported agents detected",
		});

		await runWrangler("setup");

		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"skills_install_skipped",
			{ reason: "No supported agents detected" },
			{}
		);
	});

	test("sends skills_install_completed metric when skills are installed", async ({
		expect,
	}) => {
		const fakeAgents = [
			{
				name: "Claude Code",
				globalPath: "/fake/.claude",
				globalSkillsPath: "/fake/.claude/skills",
			},
		];
		vi.mocked(installCloudflareSkillsGlobally).mockResolvedValueOnce({
			targetedAgents: fakeAgents,
		});

		await runWrangler("setup");

		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"skills_install_completed",
			{ agents: fakeAgents },
			{}
		);
	});
});
