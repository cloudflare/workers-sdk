import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import ci from "ci-info";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { sendMetricsEvent } from "../metrics/send-event";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import type { maybeInstallCloudflareSkillsGlobally as InstallFnType } from "../agents-skills-install";
import type * as SendEventModule from "../metrics/send-event";

// Undo the global no-op mock from vitest.setup.ts so we test the real implementation
vi.unmock("../agents-skills-install");

// Mock rosie-skills to avoid real network/WASM calls.
const mockRosieInstall = vi.fn();
const mockRosieAgents = vi.fn();
vi.mock("rosie-skills", () => ({
	install: mockRosieInstall,
	agents: mockRosieAgents,
}));

// Mock sendMetricsEvent so we can verify metrics are sent for each code path.
vi.mock("../metrics/send-event", async (importOriginal) => {
	const original = await importOriginal<typeof SendEventModule>();
	return {
		...original,
		sendMetricsEvent: vi.fn(),
	};
});

/** Default rosie.agents() return value: Claude Code detected, Cursor not detected. */
const DEFAULT_AGENTS = [
	{
		name: "claude",
		display: "Claude Code",
		detected: true,
		installPath: "/fake/.claude/skills",
	},
	{
		name: "cursor",
		display: "Cursor",
		detected: false,
		installPath: null,
	},
];

/** Default rosie.install() return value matching a successful single-agent install. */
const DEFAULT_INSTALL_RESULT = {
	skills: [
		{
			name: "cloudflare",
			kind: "skill" as const,
			installedAgents: ["claude"],
			failedAgents: [],
		},
	],
	installedAgents: ["claude"],
	failedAgents: [],
	installedInstruction: null,
};

/** Writes the skills-install metadata file to the global wrangler config path. */
function writeMetadataFile(content: Record<string, unknown>): void {
	const configDir = getGlobalWranglerConfigPath();
	mkdirSync(configDir, { recursive: true });
	writeFileSync(
		path.join(configDir, "agents-skills-install.jsonc"),
		JSON.stringify(content)
	);
}

/** Reads and parses the skills-install metadata file. */
function readMetadataFile(): Record<string, unknown> {
	const filePath = path.join(
		getGlobalWranglerConfigPath(),
		"agents-skills-install.jsonc"
	);
	return JSON.parse(readFileSync(filePath, "utf8"));
}

/**
 * Re-imports the agents-skills-install module with a fresh module graph.
 * This is necessary because tests need a clean module state after mocks
 * are reconfigured per test.
 */
async function freshImport(): Promise<typeof InstallFnType> {
	vi.resetModules();
	const mod = await import("../agents-skills-install");
	return mod.maybeInstallCloudflareSkillsGlobally;
}

describe("maybeInstallCloudflareSkillsGlobally", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
		mockRosieAgents.mockResolvedValue(DEFAULT_AGENTS);
		mockRosieInstall.mockResolvedValue(DEFAULT_INSTALL_RESULT);
	});

	afterEach(() => {
		clearDialogs();
	});

	describe("skip conditions", () => {
		test("skips silently when metadata file exists and sends no metrics", async ({
			expect,
		}) => {
			writeMetadataFile({ accepted: true, date: "2025-01-01T00:00:00Z" });
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).not.toHaveBeenCalled();
		});

		test("force=true ignores existing metadata file", async ({ expect }) => {
			writeMetadataFile({ accepted: true, date: "2025-01-01T00:00:00Z" });
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
			});
			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);
		});

		test("skips and sends skills_install_skipped when no agents are detected", async ({
			expect,
		}) => {
			mockRosieAgents.mockResolvedValueOnce([
				{
					name: "claude",
					display: "Claude Code",
					detected: false,
					installPath: null,
				},
			]);
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "No supported agents detected" },
				{}
			);
		});

		test("skips and sends skills_install_skipped when rosie.agents() returns empty", async ({
			expect,
		}) => {
			mockRosieAgents.mockResolvedValueOnce([]);
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "No supported agents detected" },
				{}
			);
		});

		test("warns and sends skills_install_skipped when rosie.install() throws", async ({
			expect,
		}) => {
			mockRosieInstall.mockRejectedValueOnce(new Error("network failure"));
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			// force=true so we don't need to mock the confirm dialog
			await maybeInstallCloudflareSkillsGlobally(true);

			expect(std.warn).toContain(
				"Failed to install Cloudflare skills: network failure"
			);
			expect(std.warn).toContain(
				"You can retry by running `wrangler --install-skills`, or install skills manually as described here: https://github.com/cloudflare/skills#installing"
			);
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "Failed to install skills" },
				{}
			);
		});

		test("sends skills_install_skipped with errorMessage when rosie.agents() throws", async ({
			expect,
		}) => {
			mockRosieAgents.mockRejectedValueOnce(new Error("WASM load failed"));
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{
					reason: "Failed to install skills",
					errorMessage: "WASM load failed",
				},
				{}
			);
		});

		test("skips in CI and sends skills_install_skipped when ci.isCI is true", async ({
			expect,
		}) => {
			vi.mocked(ci).isCI = true;
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			// Verify neither agent detection nor install was attempted
			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "Running in CI" },
				{}
			);
		});

		test("force=true bypasses CI check and installs skills", async ({
			expect,
		}) => {
			vi.mocked(ci).isCI = true;
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
			});
		});

		test("logs info and sends skills_install_skipped when TTY is false", async ({
			expect,
		}) => {
			setIsTTY(false);
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			expect(std.out).toContain(
				"Cloudflare agent skills are available for: Claude Code"
			);
			// Verify no install call was made
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "Non-interactive terminal" },
				{}
			);
		});
	});

	describe("user prompt interaction", () => {
		test("writes metadata, sends skills_install_skipped, and does not install when user declines", async ({
			expect,
		}) => {
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: false,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			// must not log a success message when the user declined
			expect(std.out).not.toContain(
				"Successfully installed Cloudflare skills for:"
			);

			// must not call rosie.install when user declined
			expect(mockRosieInstall).not.toHaveBeenCalled();

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(false);
			expect(metadata.date).toBeDefined();

			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "User declined" },
				{}
			);
		});

		test("calls rosie.install, logs success, and sends skills_install_completed when user accepts", async ({
			expect,
		}) => {
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
			});

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);

			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_completed",
				{
					agents: [
						{
							name: "Claude Code",
							rosieId: "claude",
							globalSkillsPath: "/fake/.claude/skills",
						},
					],
				},
				{}
			);
		});

		test("force=true installs skills without prompting", async ({ expect }) => {
			// No mockConfirm — if a prompt fires, the test will fail with "Unexpected call to prompts"
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
			});

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);
		});
	});

	describe("multiple agents", () => {
		test("detects and installs skills for multiple agents", async ({
			expect,
		}) => {
			mockRosieAgents.mockResolvedValueOnce([
				{
					name: "claude",
					display: "Claude Code",
					detected: true,
					installPath: "/fake/.claude/skills",
				},
				{
					name: "cursor",
					display: "Cursor",
					detected: true,
					installPath: "/fake/.cursor/skills",
				},
			]);
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude", "cursor"],
				lockfile: false,
			});

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code, Cursor."
			);
		});
	});

	describe("install failure", () => {
		test("writes metadata with installFailed when rosie.install() throws", async ({
			expect,
		}) => {
			mockRosieInstall.mockRejectedValueOnce(
				new Error("tarball download failed")
			);
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			expect(std.warn).toContain(
				"Failed to install Cloudflare skills: tarball download failed"
			);
			expect(std.warn).toContain(
				"You can retry by running `wrangler --install-skills`, or install skills manually as described here: https://github.com/cloudflare/skills#installing"
			);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.installFailed).toBe(true);
		});

		test("success message excludes agents that failed", async ({ expect }) => {
			mockRosieAgents.mockResolvedValueOnce([
				{
					name: "claude",
					display: "Claude Code",
					detected: true,
					installPath: "/fake/.claude/skills",
				},
				{
					name: "cursor",
					display: "Cursor",
					detected: true,
					installPath: "/fake/.cursor/skills",
				},
			]);
			mockRosieInstall.mockResolvedValueOnce({
				skills: [
					{
						name: "cloudflare",
						kind: "skill",
						installedAgents: ["claude"],
						failedAgents: ["cursor"],
					},
				],
				installedAgents: ["claude"],
				failedAgents: ["cursor"],
				installedInstruction: null,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			// Success message should only mention succeeded agents
			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);
			expect(std.out).not.toContain("Cursor");

			// Warning should mention the failed agent and retry hint
			expect(std.warn).toContain(
				"Skills installation failed for agents: cursor."
			);
			expect(std.warn).toContain(
				"You can retry by running `wrangler --install-skills`, or install skills manually as described here: https://github.com/cloudflare/skills#installing"
			);
		});
	});

	describe("metadata file", () => {
		test("writes metadata file with correct content when user accepts", async ({
			expect,
		}) => {
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
			expect(metadata.detectedAgents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "Claude Code",
						rosieId: "claude",
					}),
				])
			);
			expect(metadata.installFailed).toBe(false);
		});

		test("writes metadata file when user declines", async ({ expect }) => {
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: false,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(false);
		});

		test("does not include installFailed in metadata when user declines", async ({
			expect,
		}) => {
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: false,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(false);

			const metadata = readMetadataFile();
			expect(metadata.installFailed).toBeUndefined();
		});

		test("sets installFailed to true when rosie.install() throws", async ({
			expect,
		}) => {
			mockRosieInstall.mockRejectedValueOnce(new Error("download failed"));
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			const metadata = readMetadataFile();
			expect(metadata.installFailed).toBe(true);
		});

		test("sets installFailed to agent names on partial failure", async ({
			expect,
		}) => {
			mockRosieInstall.mockResolvedValueOnce({
				skills: [
					{
						name: "cloudflare",
						kind: "skill",
						installedAgents: ["claude"],
						failedAgents: ["cursor"],
					},
				],
				installedAgents: ["claude"],
				failedAgents: ["cursor"],
				installedInstruction: null,
			});
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.installFailed).toEqual(["cursor"]);
		});

		test("sets installFailed to false when all agents succeed", async ({
			expect,
		}) => {
			const maybeInstallCloudflareSkillsGlobally = await freshImport();

			await maybeInstallCloudflareSkillsGlobally(true);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.installFailed).toBe(false);
		});
	});
});
