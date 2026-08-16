import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import ci from "ci-info";
import { http, HttpResponse } from "msw";
import prompts from "prompts";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	skillInstallPromptMessageAfterWranglerCommandHandler,
	type runSkillsInstallFlow as RunFlowFnType,
	type runSkillsUpdateFlow as UpdateFlowFnType,
	type telemetryCurrentAgentSkillsInstalled as TelemetryFnType,
} from "../agents-skills-install";
import { sendMetricsEvent } from "../metrics/send-event";
import { detectAgent } from "../utils/detect-agent";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import type * as SendEventModule from "../metrics/send-event";

// Undo the global no-op mock from vitest.setup.ts so we test the real implementation
vi.unmock("../agents-skills-install");

vi.mock("../utils/detect-agent");
const mockDetectAgent = vi.mocked(detectAgent);

// Mock rosie-skills to avoid real network/WASM calls.
// vi.hoisted() is required because vi.mock() factories are hoisted above normal
// variable declarations, so plain `const` variables would still be in the TDZ.
const { mockRosieInstall, mockRosieAgents } = vi.hoisted(() => ({
	mockRosieInstall: vi.fn(),
	mockRosieAgents: vi.fn(),
}));
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
	const configDir = getGlobalConfigPath();
	mkdirSync(configDir, { recursive: true });
	writeFileSync(
		path.join(configDir, "agents-skills-install.jsonc"),
		JSON.stringify(content)
	);
}

/** Reads and parses the skills-install metadata file. */
function readMetadataFile(): Record<string, unknown> {
	const filePath = path.join(
		getGlobalConfigPath(),
		"agents-skills-install.jsonc"
	);
	return JSON.parse(readFileSync(filePath, "utf8"));
}

/**
 * Re-imports the agents-skills-install module with a fresh module graph.
 * This is necessary because tests need a clean module state after mocks
 * are reconfigured per test.
 *
 * @returns The `runSkillsInstallFlow` function from a fresh module import.
 */
async function freshImport(): Promise<typeof RunFlowFnType> {
	vi.resetModules();
	const mod = await import("../agents-skills-install");
	return mod.runSkillsInstallFlow;
}

/**
 * Like {@link freshImport} but returns the update flow function instead.
 * Each call resets the module graph so that tests start with a clean state.
 *
 * @returns The `runSkillsUpdateFlow` function from a fresh module import.
 */
async function freshUpdateImport(): Promise<typeof UpdateFlowFnType> {
	vi.resetModules();
	const mod = await import("../agents-skills-install");
	return mod.runSkillsUpdateFlow;
}

/**
 * Like {@link freshImport} but returns the telemetry function instead.
 * Each call resets the module graph (and hence the memoised promise) so
 * that tests start with a clean state.
 *
 * @returns The `telemetryCurrentAgentSkillsInstalled` function from a fresh module import.
 */
async function freshTelemetryImport(): Promise<typeof TelemetryFnType> {
	vi.resetModules();
	const mod = await import("../agents-skills-install");
	return mod.telemetryCurrentAgentSkillsInstalled;
}

/**
 * Creates an agent's global config directory under `os.homedir()`.
 * This is needed because the telemetry function checks for skills in
 * agent-specific directories.
 *
 * @param dirName The agent's directory name relative to $HOME (e.g. ".claude").
 */
function createAgentDir(dirName: string): void {
	mkdirSync(path.join(os.homedir(), dirName), { recursive: true });
}

describe("runSkillsInstallFlow with force-install prompt", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	/** The prompt message used by the --install-skills global flag. */
	const installPromptMessage = (agents: string[]) =>
		`Wrangler detected the following AI coding agents: ${agents.join(", ")}. Would you like to install Cloudflare skills for them?`;

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).not.toHaveBeenCalled();
		});

		test("skips silently when metadata file has accepted='unanswered' (user interrupted prompt)", async ({
			expect,
		}) => {
			writeMetadataFile({
				version: 1,
				accepted: "unanswered",
				date: "2025-01-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosie: { id: "claude", globalPath: "/fake/.claude/skills" },
					},
				],
			});
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).not.toHaveBeenCalled();
		});

		// TODO(dario): Remove this migration branch after 2026-06-05 — by then
		// most active users' metadata files will have been converted to version 1.
		test("skips silently when metadata file uses the legacy format (no version field) and migrates it on disk", async ({
			expect,
		}) => {
			writeMetadataFile({
				accepted: true,
				date: "2025-07-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosieId: "claude",
						globalSkillsPath: "/fake/.claude/skills",
					},
				],
				installFailed: false,
			});
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).not.toHaveBeenCalled();
			// Verify the file was migrated to the new format on disk
			const migratedMetadata = readMetadataFile();
			expect(migratedMetadata.version).toBe(1);
			expect(migratedMetadata.detectedAgents).toEqual([
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: "/fake/.claude/skills" },
				},
			]);
		});

		test("force=true ignores existing metadata file", async ({ expect }) => {
			writeMetadataFile({ accepted: true, date: "2025-01-01T00:00:00Z" });
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
				onLog: expect.any(Function),
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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

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
			const runSkillsInstallFlow = await freshImport();

			// force=true so we don't need to mock the confirm dialog
			await runSkillsInstallFlow({ force: true });

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
				onLog: expect.any(Function),
			});
		});

		test("sends skills_install_skipped without logging anything in the terminal when TTY is false", async ({
			expect,
		}) => {
			setIsTTY(false);
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			// Nothing has been logged
			expect(std.out).toEqual("");

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
				onLog: expect.any(Function),
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
							rosie: {
								id: "claude",
							},
						},
					],
				},
				{}
			);
		});

		test("writes metadata with accepted='unanswered' before showing the confirm prompt", async ({
			expect,
		}) => {
			// Intercept the prompts call to inspect the metadata file state at
			// the moment the confirmation prompt is displayed to the user.
			vi.mocked(prompts).mockImplementationOnce(() => {
				const metadata = readMetadataFile();
				expect(metadata.accepted).toBe("unanswered");
				expect(metadata.detectedAgents).toEqual([
					{
						name: "Claude Code",
						rosie: { id: "claude", globalPath: "/fake/.claude/skills" },
					},
				]);
				return Promise.resolve({ value: true });
			});
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			// After the flow completes, the final metadata should reflect the
			// user's actual answer, overwriting the "unanswered" marker.
			const finalMetadata = readMetadataFile();
			expect(finalMetadata.accepted).toBe(true);
		});

		test("force=true installs skills without prompting", async ({ expect }) => {
			// No mockConfirm — if a prompt fires, the test will fail with "Unexpected call to prompts"
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
				onLog: expect.any(Function),
			});

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);
		});

		test("force=true does not write 'unanswered' metadata before installing", async ({
			expect,
		}) => {
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			// The final metadata should be accepted=true, never "unanswered"
			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
		});
	});

	describe("telemetry command property", () => {
		test("includes command in skills_install_completed when provided", async ({
			expect,
		}) => {
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true, command: "deploy" });

			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_completed",
				{
					agents: [
						{
							name: "Claude Code",
							rosie: {
								id: "claude",
							},
						},
					],
					command: "deploy",
				},
				{}
			);
		});

		test("includes command in skills_install_skipped when provided", async ({
			expect,
		}) => {
			mockRosieAgents.mockResolvedValueOnce([]);
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				command: "dev",
				promptMessage: installPromptMessage,
			});

			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "No supported agents detected", command: "dev" },
				{}
			);
		});

		test("omits command from metrics when not provided", async ({ expect }) => {
			mockRosieAgents.mockResolvedValueOnce([]);
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "No supported agents detected" },
				{}
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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude", "cursor"],
				lockfile: false,
				onLog: expect.any(Function),
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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
			expect(metadata.detectedAgents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "Claude Code",
						rosie: expect.objectContaining({ id: "claude" }),
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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({
				force: false,
				promptMessage: installPromptMessage,
			});

			const metadata = readMetadataFile();
			expect(metadata.installFailed).toBeUndefined();
		});

		test("sets installFailed to true when rosie.install() throws", async ({
			expect,
		}) => {
			mockRosieInstall.mockRejectedValueOnce(new Error("download failed"));
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

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
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.installFailed).toEqual(["cursor"]);
			// installedTreeSha must be undefined so the update flow re-prompts
			// for the failed agents instead of short-circuiting.
			expect(metadata.installedTreeSha).toBeUndefined();
		});

		test("sets installFailed to false when all agents succeed", async ({
			expect,
		}) => {
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.installFailed).toBe(false);
		});

		test("records union of previous and current skill names on partial install failure", async ({
			expect,
		}) => {
			// Pre-existing metadata with a previous install that had "old-skill"
			writeMetadataFile({
				version: 1,
				accepted: true,
				date: "2025-01-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosie: { id: "claude", globalPath: "/fake/.claude/skills" },
					},
				],
				installedSkillNames: ["old-skill"],
			});
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
				skills: [],
				installedAgents: ["claude"],
				failedAgents: ["cursor"],
				installedInstruction: null,
			});
			// Upstream now has "cloudflare" and "wrangler" (not "old-skill")
			mockGitHubSkillsApi(["cloudflare", "wrangler"], "sha-123");
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			const metadata = readMetadataFile();
			// Should be the union: old-skill (previous) + cloudflare, wrangler (current)
			expect(metadata.installedSkillNames).toEqual(
				expect.arrayContaining(["old-skill", "cloudflare", "wrangler"])
			);
			expect((metadata.installedSkillNames as string[]).length).toBe(3);
		});

		test("preserves previous skill names when GitHub API fetch fails during install", async ({
			expect,
		}) => {
			writeMetadataFile({
				version: 1,
				accepted: true,
				date: "2025-01-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosie: { id: "claude", globalPath: "/fake/.claude/skills" },
					},
				],
				installedSkillNames: ["cloudflare"],
			});
			// Both GitHub API calls fail, and no cache exists
			mockGitHubSkillsApiNetworkError();
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			const metadata = readMetadataFile();
			// Should preserve the previous list, not overwrite with []
			expect(metadata.installedSkillNames).toEqual(["cloudflare"]);
		});

		test("falls back to cached tree SHA when post-install fetchSkillsTreeSha fails", async ({
			expect,
		}) => {
			// The skills contents API succeeds (so skill names are fetched),
			// but the root contents API fails (so fetchSkillsTreeSha returns
			// undefined). The install flow should fall back to the cached SHA.
			msw.use(
				http.get(
					"https://api.github.com/repos/cloudflare/skills/contents/skills",
					() => {
						return HttpResponse.json([
							{ name: "cloudflare", type: "dir" },
							{ name: "wrangler", type: "dir" },
						]);
					}
				),
				http.get(
					"https://api.github.com/repos/cloudflare/skills/contents/",
					() => {
						// First call: during fetchSkillNamesFromGitHub — returns
						// the tree SHA which gets cached.
						// Second call: the standalone fetchSkillsTreeSha after
						// install — returns an error so freshTreeSha is undefined.
						return HttpResponse.json([
							{ name: "skills", type: "dir", sha: "cached-sha" },
							{ name: "README.md", type: "file", sha: "readme-sha" },
						]);
					},
					{ once: true }
				),
				http.get(
					"https://api.github.com/repos/cloudflare/skills/contents/",
					() => {
						return new HttpResponse(null, { status: 403 });
					}
				)
			);
			const runSkillsInstallFlow = await freshImport();

			await runSkillsInstallFlow({ force: true });

			const metadata = readMetadataFile();
			expect(metadata.installedTreeSha).toBe("cached-sha");
		});
	});
});

describe("runSkillsInstallFlow with custom prompt message", () => {
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
		test("skips silently when metadata file exists", async ({ expect }) => {
			writeMetadataFile({ accepted: true, date: "2025-01-01T00:00:00Z" });
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).not.toHaveBeenCalled();
		});

		test("skips silently when metadata file records a decline", async ({
			expect,
		}) => {
			writeMetadataFile({ accepted: false, date: "2025-01-01T00:00:00Z" });
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).not.toHaveBeenCalled();
		});

		test("skips silently when metadata file has accepted='unanswered'", async ({
			expect,
		}) => {
			writeMetadataFile({
				version: 1,
				accepted: "unanswered",
				date: "2025-01-01T00:00:00Z",
			});
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(mockRosieAgents).not.toHaveBeenCalled();
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).not.toHaveBeenCalled();
		});

		test("skips in CI", async ({ expect }) => {
			vi.mocked(ci).isCI = true;
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "Running in CI" },
				{}
			);
		});

		test("skips in non-interactive terminal", async ({ expect }) => {
			setIsTTY(false);
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(std.out).toEqual("");
			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "Non-interactive terminal" },
				{}
			);
		});

		test("skips when no agents are detected", async ({ expect }) => {
			mockRosieAgents.mockResolvedValueOnce([]);
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(mockRosieInstall).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "No supported agents detected" },
				{}
			);
		});
	});

	describe("prompt message", () => {
		test("uses the caller-provided prompt message", async ({ expect }) => {
			mockConfirm({
				text: "Before you go, Wrangler detected AI coding agents that may not be best configured to work with Cloudflare: Claude Code. Would you like Wrangler to automatically install Cloudflare skills for the best experience?",
				result: false,
			});
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"skills_install_skipped",
				{ reason: "User declined" },
				{}
			);
		});
	});

	describe("user prompt interaction", () => {
		test("installs skills when user accepts", async ({ expect }) => {
			mockConfirm({
				text: expect.stringContaining(
					"Would you like Wrangler to automatically install Cloudflare skills"
				) as unknown as string,
				result: true,
			});
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(mockRosieInstall).toHaveBeenCalledWith("cloudflare/skills", {
				global: true,
				agent: ["claude"],
				lockfile: false,
				onLog: expect.any(Function),
			});

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.installFailed).toBe(false);
		});

		test("writes metadata with accepted=false when user declines", async ({
			expect,
		}) => {
			mockConfirm({
				text: expect.stringContaining(
					"Would you like Wrangler to automatically install Cloudflare skills"
				) as unknown as string,
				result: false,
			});
			const flow = await freshImport();

			await flow({
				force: false,
				promptMessage: skillInstallPromptMessageAfterWranglerCommandHandler,
			});

			expect(mockRosieInstall).not.toHaveBeenCalled();

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(false);
		});
	});
});

/**
 * MSW handler that returns a fake GitHub Contents API response.
 *
 * @param skillNames The skill directory names to include in the mocked response.
 * @param treeSha Optional tree SHA for the `skills/` directory root entry.
 */
function mockGitHubSkillsApi(skillNames: string[], treeSha?: string) {
	const entries = skillNames.map((name) => ({ name, type: "dir" }));
	msw.use(
		http.get(
			"https://api.github.com/repos/cloudflare/skills/contents/skills",
			() => {
				return HttpResponse.json(entries);
			}
		),
		http.get("https://api.github.com/repos/cloudflare/skills/contents/", () => {
			return HttpResponse.json([
				{
					name: "skills",
					type: "dir",
					sha: treeSha ?? "default-tree-sha",
				},
				{ name: "README.md", type: "file", sha: "readme-sha" },
			]);
		})
	);
}

/**
 * MSW handler that makes the GitHub Contents API return an error.
 *
 * @param status The HTTP status code to return. Defaults to `403`.
 */
function mockGitHubSkillsApiError(status = 403) {
	msw.use(
		http.get(
			"https://api.github.com/repos/cloudflare/skills/contents/skills",
			() => {
				return new HttpResponse(null, { status });
			}
		),
		http.get("https://api.github.com/repos/cloudflare/skills/contents/", () => {
			return new HttpResponse(null, { status });
		})
	);
}

/** MSW handler that makes the GitHub Contents API throw a network error. */
function mockGitHubSkillsApiNetworkError() {
	msw.use(
		http.get(
			"https://api.github.com/repos/cloudflare/skills/contents/skills",
			() => {
				return HttpResponse.error();
			}
		),
		http.get("https://api.github.com/repos/cloudflare/skills/contents/", () => {
			return HttpResponse.error();
		})
	);
}

describe("telemetryCurrentAgentSkillsInstalled", () => {
	runInTempDir();
	mockConsoleMethods();

	beforeEach(() => {
		// Default: no agent detected
		mockDetectAgent.mockReturnValue({
			isAgent: false,
			id: null,
		});
	});

	test("resolves to null when no agent is detected", async ({ expect }) => {
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe(null);
	});

	test("resolves to null when detectAgent returns null id", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: false,
			id: null,
		});
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe(null);
	});

	test("resolves to null when agent is detected but not in telemetryAgentMappings", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "jules",
		});
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe(null);
	});

	test("resolves to false when GitHub API fetch fails and no cache exists", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		mockGitHubSkillsApiNetworkError();
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe(false);
	});

	test("resolves to false when no skills are present in agent's globalSkillsPath", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe(false);
	});

	test("resolves to 'manual' when some skills exist but no metadata file", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("manual");
	});

	test("resolves to 'automatic' when skills exist and metadata confirms successful install", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		const claudeGlobalSkillsPath = path.join(os.homedir(), ".claude", "skills");
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeGlobalSkillsPath },
				},
			],
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("automatic");
	});

	test("resolves to 'manual' when metadata says install failed entirely (installFailed: true)", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		const claudeGlobalSkillsPath = path.join(os.homedir(), ".claude", "skills");
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeGlobalSkillsPath },
				},
			],
			installFailed: true,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("manual");
	});

	test("resolves to 'manual' when metadata says install failed for this agent (installFailed: string[])", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		const claudeGlobalSkillsPath = path.join(os.homedir(), ".claude", "skills");
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeGlobalSkillsPath },
				},
			],
			installFailed: ["claude"],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("manual");
	});

	test("resolves to 'manual' when agent is not in detectedAgents", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [],
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("manual");
	});

	test("resolves to 'manual' when metadata has accepted='unanswered' (user interrupted prompt)", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		const claudeGlobalSkillsPath = path.join(os.homedir(), ".claude", "skills");
		writeMetadataFile({
			version: 1,
			accepted: "unanswered",
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeGlobalSkillsPath },
				},
			],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		// "unanswered" must not be treated as "accepted" — skills were never
		// installed by Wrangler, so the correct status is "manual".
		expect(result).toBe("manual");
	});

	test("uses cached GitHub API response within TTL", async ({ expect }) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });

		// Write a fresh cache file
		const configDir = getGlobalConfigPath();
		mkdirSync(configDir, { recursive: true });
		writeFileSync(
			path.join(configDir, "cloudflare-skills-repo-cache.json"),
			JSON.stringify({
				lastUpdate: Date.now(),
				skillNames: ["cloudflare", "wrangler"],
			})
		);

		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: {
						id: "claude",
						globalPath: path.join(os.homedir(), ".claude", "skills"),
					},
				},
			],
			installFailed: false,
		});

		// Do NOT set up a GitHub API mock — if fetch is called, it would
		// go unhandled. The test verifies the cache is used instead.
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("automatic");
	});

	test("falls back to stale cache when GitHub API returns an error", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "claude-code",
		});
		createAgentDir(".claude");
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });

		// Write an expired cache file (TTL is 24h, set lastUpdate to 48h ago)
		const configDir = getGlobalConfigPath();
		mkdirSync(configDir, { recursive: true });
		writeFileSync(
			path.join(configDir, "cloudflare-skills-repo-cache.json"),
			JSON.stringify({
				lastUpdate: Date.now() - 48 * 60 * 60 * 1000,
				skillNames: ["cloudflare", "wrangler"],
			})
		);

		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: {
						id: "claude",
						globalPath: path.join(os.homedir(), ".claude", "skills"),
					},
				},
			],
			installFailed: false,
		});

		mockGitHubSkillsApiError(403);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("automatic");
	});

	test("works with cursor-agent amIVibingId mapping", async ({ expect }) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "cursor-agent",
		});
		createAgentDir(".cursor");
		const cursorSkills = path.join(os.homedir(), ".cursor", "skills");
		mkdirSync(path.join(cursorSkills, "cloudflare"), { recursive: true });
		const cursorGlobalSkillsPath = path.join(os.homedir(), ".cursor", "skills");
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Cursor",
					rosie: { id: "cursor", globalPath: cursorGlobalSkillsPath },
				},
			],
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("automatic");
	});

	test("resolves to 'manual' when skills exist at an alternativeGlobalPath but no metadata", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "opencode",
		});
		// Primary rosie path (~/.config/opencode/skills) is empty, but skills
		// exist in the alternative path (~/.agents/skills).
		createAgentDir(".config/opencode");
		const agentsSkills = path.join(os.homedir(), ".agents", "skills");
		mkdirSync(path.join(agentsSkills, "cloudflare"), { recursive: true });
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("manual");
	});

	test("resolves to 'automatic' when skills at alternativeGlobalPath were installed for another agent", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "opencode",
		});
		// Primary rosie path (~/.config/opencode/skills) is empty, but skills
		// exist in ~/.agents/skills (which is Warp's rosie install target).
		createAgentDir(".config/opencode");
		const agentsSkills = path.join(os.homedir(), ".agents", "skills");
		mkdirSync(path.join(agentsSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Cline, Dexto, Warp",
					rosie: { id: "warp", globalPath: agentsSkills },
				},
			],
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("automatic");
	});

	test("resolves to 'manual' when skills at alternativeGlobalPath were installed for another agent but failed", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "opencode",
		});
		createAgentDir(".config/opencode");
		const agentsSkills = path.join(os.homedir(), ".agents", "skills");
		mkdirSync(path.join(agentsSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents: [
				{
					name: "Cline, Dexto, Warp",
					rosie: { id: "warp", globalPath: agentsSkills },
				},
			],
			installFailed: ["warp"],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe("manual");
	});

	test("resolves to false when skills are not at primary or any alternativeGlobalPath", async ({
		expect,
	}) => {
		mockDetectAgent.mockReturnValue({
			isAgent: true,
			id: "opencode",
		});
		// Create the primary path dir but leave it empty, and don't create
		// any alternative paths either.
		createAgentDir(".config/opencode/skills");
		mockGitHubSkillsApi(["cloudflare", "wrangler"]);
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const result = await telemetryCurrentAgentSkillsInstalled();

		expect(result).toBe(false);
	});

	// TODO(dario): Remove this migration branch after 2026-06-05 — by then
	// most active users' metadata files will have been converted to version 1.
	describe("legacy metadata migration", () => {
		test("resolves to 'automatic' when metadata uses the legacy flat AgentInfo schema", async ({
			expect,
		}) => {
			mockDetectAgent.mockReturnValue({
				isAgent: true,
				id: "claude-code",
			});
			createAgentDir(".claude");
			const claudeSkills = path.join(os.homedir(), ".claude", "skills");
			mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
			// Write old-format metadata (no version field, flat rosieId/globalSkillsPath)
			writeMetadataFile({
				accepted: true,
				date: "2025-07-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosieId: "claude",
						globalSkillsPath: claudeSkills,
					},
				],
				installFailed: false,
			});
			mockGitHubSkillsApi(["cloudflare", "wrangler"]);
			const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

			const result = await telemetryCurrentAgentSkillsInstalled();

			expect(result).toBe("automatic");
		});

		test("migrates legacy metadata to version 1 on disk when read", async ({
			expect,
		}) => {
			mockDetectAgent.mockReturnValue({
				isAgent: true,
				id: "claude-code",
			});
			createAgentDir(".claude");
			const claudeSkills = path.join(os.homedir(), ".claude", "skills");
			mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
			// Write old-format metadata
			writeMetadataFile({
				accepted: true,
				date: "2025-07-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosieId: "claude",
						globalSkillsPath: claudeSkills,
					},
				],
				installFailed: false,
			});
			mockGitHubSkillsApi(["cloudflare", "wrangler"]);
			const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

			// Trigger the read (and migration)
			await telemetryCurrentAgentSkillsInstalled();

			// The file on disk should now be in the new format
			const migratedMetadata = readMetadataFile();
			expect(migratedMetadata).toEqual({
				version: 1,
				accepted: true,
				date: "2025-07-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosie: { id: "claude", globalPath: claudeSkills },
					},
				],
				installFailed: false,
			});
		});

		test("resolves to 'manual' when legacy metadata says install failed", async ({
			expect,
		}) => {
			mockDetectAgent.mockReturnValue({
				isAgent: true,
				id: "claude-code",
			});
			createAgentDir(".claude");
			const claudeSkills = path.join(os.homedir(), ".claude", "skills");
			mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
			// Write old-format metadata with installFailed: true
			writeMetadataFile({
				accepted: true,
				date: "2025-07-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosieId: "claude",
						globalSkillsPath: claudeSkills,
					},
				],
				installFailed: true,
			});
			mockGitHubSkillsApi(["cloudflare", "wrangler"]);
			const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

			const result = await telemetryCurrentAgentSkillsInstalled();

			expect(result).toBe("manual");
		});
	});

	test("memoises the result across multiple calls", async ({ expect }) => {
		mockDetectAgent.mockReturnValue({
			isAgent: false,
			id: null,
		});
		const telemetryCurrentAgentSkillsInstalled = await freshTelemetryImport();

		const first = telemetryCurrentAgentSkillsInstalled();
		const second = telemetryCurrentAgentSkillsInstalled();

		expect(first).toBe(second);
		expect(await first).toBe(null);
	});
});

describe("runSkillsUpdateFlow", () => {
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

	test("skips when no metadata file exists", async ({ expect }) => {
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("skips when metadata says user declined install", async ({ expect }) => {
		writeMetadataFile({
			version: 1,
			accepted: false,
			date: "2025-01-01T00:00:00Z",
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("skips when metadata says install failed entirely", async ({
		expect,
	}) => {
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			installFailed: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("skips when installedTreeSha matches remote SHA", async ({ expect }) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "same-sha",
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "same-sha");
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("skips when user already declined this remote SHA", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			declinedTreeSha: "new-sha",
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("prompts and updates when upstream SHA is different", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({ command: "deploy" });

		expect(mockRosieInstall).toHaveBeenCalledOnce();
		expect(std.out).toContain("Successfully updated Cloudflare skills");

		const metadata = readMetadataFile();
		expect(metadata.installedTreeSha).toBe("new-sha");
		expect(metadata.declinedTreeSha).toBeUndefined();

		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"skills_update_completed",
			expect.objectContaining({
				command: "deploy",
			}),
			{}
		);
	});

	test("records a freshly-fetched tree SHA instead of the cached one after a successful update", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		// The cached remote SHA is "cached-sha", but by the time rosieInstall
		// completes upstream has advanced to "fresh-sha".
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "cached-sha");

		mockRosieInstall.mockImplementationOnce(async () => {
			// Simulate upstream advancing while install runs: override the
			// /contents/ handler so fetchSkillsTreeSha() returns the newer SHA.
			msw.use(
				http.get(
					"https://api.github.com/repos/cloudflare/skills/contents/",
					() => {
						return HttpResponse.json([
							{ name: "skills", type: "dir", sha: "fresh-sha" },
							{ name: "README.md", type: "file", sha: "readme-sha" },
						]);
					}
				)
			);
			return { failedAgents: [] };
		});

		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		const metadata = readMetadataFile();
		expect(metadata.installedTreeSha).toBe("fresh-sha");
	});

	test("writes declinedTreeSha before showing the confirm prompt so an interrupted prompt does not reappear", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");

		// Intercept the prompts call to inspect the metadata file state at
		// the moment the confirmation prompt is displayed to the user.
		vi.mocked(prompts).mockImplementationOnce(() => {
			const metadata = readMetadataFile();
			expect(metadata.declinedTreeSha).toBe("new-sha");
			return Promise.resolve({ value: true });
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({ command: "deploy" });

		// After the flow completes with acceptance, the final metadata should
		// clear declinedTreeSha and record the new installedTreeSha.
		const finalMetadata = readMetadataFile();
		expect(finalMetadata.installedTreeSha).toBe("new-sha");
		expect(finalMetadata.declinedTreeSha).toBeUndefined();
	});

	test("records declinedTreeSha when user declines and does not opt out of future prompts", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm(
			{
				text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
				result: false,
			},
			{
				text: "Would you like Wrangler to stop asking about skills updates?",
				result: false,
			}
		);
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({ command: "deploy" });

		expect(mockRosieInstall).not.toHaveBeenCalled();
		expect(std.out).toContain(
			"Understood, skills will not be updated at this time."
		);

		const metadata = readMetadataFile();
		expect(metadata.declinedTreeSha).toBe("new-sha");
		expect(metadata.date).not.toBe("2025-01-01T00:00:00Z");
		expect(metadata.skipUpdatePrompts).toBeUndefined();

		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"skills_update_skipped",
			expect.objectContaining({
				reason: "User declined",
				command: "deploy",
			}),
			{}
		);
	});

	test("persists skipUpdatePrompts when user declines and opts out of future prompts", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm(
			{
				text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
				result: false,
			},
			{
				text: "Would you like Wrangler to stop asking about skills updates?",
				result: true,
			}
		);
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({ command: "deploy" });

		expect(mockRosieInstall).not.toHaveBeenCalled();
		expect(std.out).toContain(
			"Skills update prompts have been disabled. You can re-enable them by running `wrangler --install-skills`."
		);

		const metadata = readMetadataFile();
		expect(metadata.declinedTreeSha).toBe("new-sha");
		expect(metadata.skipUpdatePrompts).toBe(true);

		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"skills_update_skipped",
			expect.objectContaining({
				reason: "User opted out permanently",
				command: "deploy",
			}),
			{}
		);
	});

	test("skips update check when skipUpdatePrompts is set in metadata", async ({
		expect,
	}) => {
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			skipUpdatePrompts: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("prompts again after upstream changes past a previously declined SHA", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			declinedTreeSha: "declined-sha",
			installFailed: false,
		});
		// Remote now has a newer SHA than the one that was declined
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "even-newer-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).toHaveBeenCalledOnce();
		expect(std.out).toContain("Successfully updated Cloudflare skills");
	});

	test("handles update failure gracefully", async ({ expect }) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		mockRosieInstall.mockRejectedValue(new Error("Network failure"));
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(std.warn).toContain("Failed to update Cloudflare skills");

		const metadata = readMetadataFile();
		expect(metadata.installedTreeSha).toBe("old-sha");
		expect(new Date(metadata.date as string).getTime()).toBeGreaterThan(
			new Date("2025-01-01T00:00:00Z").getTime()
		);

		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"skills_update_skipped",
			expect.objectContaining({
				reason: "Failed to update skills",
			}),
			{}
		);
	});

	test("retries previously-failed agents on next update run", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		const cursorSkills = path.join(os.homedir(), ".cursor", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		// cursor's skills dir may not exist if the previous install failed
		// before creating it — the update flow should still include it.
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
				{
					name: "Cursor",
					rosie: { id: "cursor", globalPath: cursorSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: ["cursor"],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).toHaveBeenCalledOnce();

		// After a successful update, the metadata should record the freshly
		// fetched tree SHA (not the cached one) so future checks compare
		// against the actual installed revision.
		const metadata = readMetadataFile();
		expect(metadata.installedTreeSha).toBe("new-sha");
		expect(metadata.installFailed).toBe(false);
	});

	test("skips when no managed agent skills exist on disk", async ({
		expect,
	}) => {
		// Metadata says skills were installed for Claude, but no skills
		// directory exists on disk.
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: {
						id: "claude",
						globalPath: path.join(os.homedir(), ".claude", "skills"),
					},
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("skips when skills were installed less than 30 days ago", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		// Date is 15 days ago — within the 30-day cooldown window
		const fifteenDaysAgo = new Date(
			Date.now() - 15 * 24 * 60 * 60 * 1000
		).toISOString();
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: fifteenDaysAgo,
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		// Don't even need to mock the GitHub API — the cooldown guard
		// should short-circuit before any network requests.
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).not.toHaveBeenCalled();
	});

	test("checks for updates when skills are older than 30 days", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		// Date is 35 days ago — past the 30-day cooldown
		const thirtyFiveDaysAgo = new Date(
			Date.now() - 35 * 24 * 60 * 60 * 1000
		).toISOString();
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: thirtyFiveDaysAgo,
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).toHaveBeenCalledOnce();
	});

	test("prompts when installedTreeSha is missing", async ({ expect }) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			// No installedTreeSha — old metadata before SHA tracking existed
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).toHaveBeenCalledOnce();
	});

	test("back-fills missing skillsTreeSha from a fresh cache and proceeds with update check", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		// Write a fresh cache WITHOUT skillsTreeSha (simulates cache from
		// an older Wrangler version or a failed fetchSkillsTreeSha call).
		const configDir = getGlobalConfigPath();
		mkdirSync(configDir, { recursive: true });
		writeFileSync(
			path.join(configDir, "cloudflare-skills-repo-cache.json"),
			JSON.stringify({
				lastUpdate: Date.now(),
				skillNames: ["cloudflare", "wrangler"],
			})
		);
		// The root contents API will provide the tree SHA when back-filling.
		msw.use(
			http.get(
				"https://api.github.com/repos/cloudflare/skills/contents/",
				() => {
					return HttpResponse.json([
						{ name: "skills", type: "dir", sha: "new-sha" },
						{ name: "README.md", type: "file", sha: "readme-sha" },
					]);
				}
			)
		);
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		// The update should proceed because the tree SHA was back-filled,
		// rather than bailing with "could not determine remote tree SHA".
		expect(mockRosieInstall).toHaveBeenCalledOnce();
	});

	test("removes stale skill directories that no longer exist upstream after a successful update", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeFileSync(
			path.join(claudeSkills, "cloudflare", "SKILL.md"),
			"# Cloudflare"
		);
		// "old-skill" was installed previously but has been removed upstream
		mkdirSync(path.join(claudeSkills, "old-skill"), { recursive: true });
		writeFileSync(
			path.join(claudeSkills, "old-skill", "SKILL.md"),
			"# Old Skill"
		);
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
			installedSkillNames: ["cloudflare", "old-skill"],
		});
		// Only "cloudflare" and "wrangler" exist upstream now — "old-skill" is gone
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).toHaveBeenCalledOnce();
		// "old-skill" should be gone
		expect(existsSync(path.join(claudeSkills, "old-skill"))).toBe(false);

		const metadata = readMetadataFile();
		expect(metadata.installedSkillNames).toEqual(["cloudflare", "wrangler"]);
	});

	test("preserves non-Cloudflare skill directories during update", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		// User-installed skill that is NOT managed by Cloudflare
		mkdirSync(path.join(claudeSkills, "my-custom-skill"), {
			recursive: true,
		});
		writeFileSync(
			path.join(claudeSkills, "my-custom-skill", "SKILL.md"),
			"# Custom"
		);
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
			installedSkillNames: ["cloudflare"],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(mockRosieInstall).toHaveBeenCalledOnce();
		// User's custom skill must be untouched
		expect(existsSync(path.join(claudeSkills, "my-custom-skill"))).toBe(true);
		expect(
			readFileSync(
				path.join(claudeSkills, "my-custom-skill", "SKILL.md"),
				"utf8"
			)
		).toBe("# Custom");
	});

	test("restores backed-up skill directories when rosieInstall throws during update", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeFileSync(
			path.join(claudeSkills, "cloudflare", "SKILL.md"),
			"# Original"
		);
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
			installedSkillNames: ["cloudflare"],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		mockRosieInstall.mockRejectedValueOnce(new Error("Network failure"));
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		expect(std.warn).toContain("Failed to update Cloudflare skills");
		// The backed-up skill directory should be restored
		expect(existsSync(path.join(claudeSkills, "cloudflare"))).toBe(true);
		expect(
			readFileSync(path.join(claudeSkills, "cloudflare", "SKILL.md"), "utf8")
		).toBe("# Original");
	});

	test("restores backed-up skill directories for agents that partially failed during update", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		const cursorSkills = path.join(os.homedir(), ".cursor", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		mkdirSync(path.join(cursorSkills, "cloudflare"), { recursive: true });
		writeFileSync(
			path.join(claudeSkills, "cloudflare", "SKILL.md"),
			"# Claude Original"
		);
		writeFileSync(
			path.join(cursorSkills, "cloudflare", "SKILL.md"),
			"# Cursor Original"
		);
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
				{
					name: "Cursor",
					rosie: { id: "cursor", globalPath: cursorSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
			installedSkillNames: ["cloudflare"],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		// rosieInstall resolves (no throw) but reports cursor as failed
		mockRosieInstall.mockResolvedValueOnce({
			skills: [],
			installedAgents: ["claude"],
			failedAgents: ["cursor"],
			installedInstruction: null,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		// Cursor's backed-up skills should be restored since its install failed
		expect(existsSync(path.join(cursorSkills, "cloudflare"))).toBe(true);
		expect(
			readFileSync(path.join(cursorSkills, "cloudflare", "SKILL.md"), "utf8")
		).toBe("# Cursor Original");
	});

	// Windows does not enforce POSIX permission bits, so chmodSync(dir, 0o444)
	// cannot make a directory unwritable there. This test is skipped on Windows
	// because the restore-failure scenario cannot be reliably simulated.
	test.skipIf(process.platform === "win32")(
		"preserves backup directory and warns when restore fails after a thrown install",
		async ({ expect }) => {
			const claudeSkills = path.join(os.homedir(), ".claude", "skills");
			mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
			writeFileSync(
				path.join(claudeSkills, "cloudflare", "SKILL.md"),
				"# Original"
			);
			writeMetadataFile({
				version: 1,
				accepted: true,
				date: "2025-01-01T00:00:00Z",
				detectedAgents: [
					{
						name: "Claude Code",
						rosie: { id: "claude", globalPath: claudeSkills },
					},
				],
				installedTreeSha: "old-sha",
				installFailed: false,
				installedSkillNames: ["cloudflare"],
			});
			mockGitHubSkillsApi(["cloudflare", "wrangler"], "new-sha");
			mockConfirm({
				text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
				result: true,
			});
			const { chmodSync } = await import("node:fs");
			mockRosieInstall.mockImplementationOnce(async () => {
				// Make the skills directory unwritable so the restore cannot
				// create the "cloudflare" subdirectory back inside it.
				chmodSync(claudeSkills, 0o444);
				throw new Error("Network failure");
			});
			const runSkillsUpdateFlow = await freshUpdateImport();

			try {
				await runSkillsUpdateFlow({});
			} finally {
				// Restore permissions so the temp dir cleanup can proceed.
				chmodSync(claudeSkills, 0o755);
			}

			expect(std.warn).toContain("Failed to update Cloudflare skills");
			// The restore should have failed because the directory is unwritable,
			// so the backup directory should be preserved and a warning logged.
			expect(std.warn).toContain(
				"Some skill directories could not be restored automatically"
			);
			expect(std.warn).toContain("A backup is available at:");
		}
	);

	test("persists installedSkillNames in metadata after successful update", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installedTreeSha: "old-sha",
			installFailed: false,
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler", "agents-sdk"], "new-sha");
		mockConfirm({
			text: "It looks like your Cloudflare skills might be out of date. Would you like Wrangler to update them for you?",
			result: true,
		});
		const runSkillsUpdateFlow = await freshUpdateImport();

		await runSkillsUpdateFlow({});

		const metadata = readMetadataFile();
		expect(metadata.installedSkillNames).toEqual([
			"cloudflare",
			"wrangler",
			"agents-sdk",
		]);
	});
});

describe("runSkillsInstallFlow cleanup", () => {
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

	test("persists installedSkillNames in metadata after successful install", async ({
		expect,
	}) => {
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "sha-123");
		const runSkillsInstallFlow = await freshImport();

		await runSkillsInstallFlow({ force: true });

		const metadata = readMetadataFile();
		expect(metadata.installedSkillNames).toEqual(["cloudflare", "wrangler"]);
	});

	test("restores backed-up skill directories when rosieInstall throws during install", async ({
		expect,
	}) => {
		const claudeSkills = path.join(os.homedir(), ".claude", "skills");
		mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
		writeFileSync(
			path.join(claudeSkills, "cloudflare", "SKILL.md"),
			"# Original"
		);
		// Write metadata with previous install
		writeMetadataFile({
			version: 1,
			accepted: true,
			date: "2025-01-01T00:00:00Z",
			detectedAgents: [
				{
					name: "Claude Code",
					rosie: { id: "claude", globalPath: claudeSkills },
				},
			],
			installFailed: false,
			installedSkillNames: ["cloudflare"],
		});
		mockGitHubSkillsApi(["cloudflare", "wrangler"], "sha-123");
		mockRosieInstall.mockRejectedValueOnce(
			new Error("tarball download failed")
		);
		const runSkillsInstallFlow = await freshImport();

		await runSkillsInstallFlow({ force: true });

		expect(std.warn).toContain("Failed to install Cloudflare skills");
		// The backed-up skill directory should be restored
		expect(existsSync(path.join(claudeSkills, "cloudflare"))).toBe(true);
		expect(
			readFileSync(path.join(claudeSkills, "cloudflare", "SKILL.md"), "utf8")
		).toBe("# Original");
	});
});
