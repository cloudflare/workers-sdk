import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import ci from "ci-info";
import { afterEach, assert, beforeEach, describe, test, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { installCloudflareSkillsGlobally as InstallFnType } from "../agents-skills-install";

// Undo the global no-op mock from vitest.setup.ts so we test the real implementation
vi.unmock("../agents-skills-install");

// Mock giget to avoid real network calls. The default downloadTemplate
// implementation creates two fake skill directories; individual tests can
// override via mockDownloadTemplate.mockImplementationOnce().
const mockDownloadTemplate = vi.fn();
vi.mock("giget", () => ({
	downloadTemplate: mockDownloadTemplate,
}));

/** Creates a fake agent config directory under the mocked HOME. */
function createAgentDir(dirName: string): string {
	const agentPath = path.join(os.homedir(), dirName);
	mkdirSync(agentPath, { recursive: true });
	return agentPath;
}

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

/** Default mockDownloadTemplate implementation that creates fake skill directories. */
function defaultDownloadImpl(_source: string, opts: { dir: string }): void {
	mkdirSync(path.join(opts.dir, "cloudflare"), { recursive: true });
	writeFileSync(
		path.join(opts.dir, "cloudflare", "SKILL.md"),
		"# Cloudflare skill"
	);
	mkdirSync(path.join(opts.dir, "wrangler"), { recursive: true });
	writeFileSync(
		path.join(opts.dir, "wrangler", "SKILL.md"),
		"# Wrangler skill"
	);
}

/**
 * Re-imports the agents-skills-install module with a fresh module graph.
 * This is necessary because the `supportedAgents` array computes paths
 * using `os.homedir()` at module load time. Since HOME is stubbed per-test
 * by runInTempDir (in beforeEach), we must reload the module after each
 * stub so that agent paths point to the temp dir, not the real home.
 */
async function freshImport(): Promise<typeof InstallFnType> {
	vi.resetModules();
	const mod = await import("../agents-skills-install");
	return mod.installCloudflareSkillsGlobally;
}

describe("installCloudflareSkillsGlobally", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
		mockDownloadTemplate.mockImplementation(
			async (source: string, opts: { dir: string }) => {
				defaultDownloadImpl(source, opts);
			}
		);
	});

	afterEach(() => {
		clearDialogs();
	});

	describe("skip conditions", () => {
		test("returns 'Already prompted' when metadata file exists", async ({
			expect,
		}) => {
			writeMetadataFile({ accepted: true, date: "2025-01-01T00:00:00Z" });
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "Already prompted",
			});
		});

		test("force=true ignores existing metadata file", async ({ expect }) => {
			writeMetadataFile({ accepted: true, date: "2025-01-01T00:00:00Z" });
			// No agent dirs exist, so it proceeds past metadata check but skips
			// at agent detection
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(true);

			expect(result).toEqual({
				skipped: true,
				reason: "No supported agents detected",
			});
		});

		test("returns 'No supported agents detected' when no agent dirs exist", async ({
			expect,
		}) => {
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "No supported agents detected",
			});
		});

		test("returns 'Failed to download skills' when download throws", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			mockDownloadTemplate.mockRejectedValueOnce(new Error("network failure"));
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "Failed to download skills",
			});
			expect(std.warn).toContain(
				"Failed to download Cloudflare skills from GitHub: network failure"
			);
		});

		test("returns 'Downloaded skills repo is empty' when cloned dir has no subdirectories", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			// Download creates no directories (empty temp dir)
			mockDownloadTemplate.mockImplementationOnce(async () => {});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "Downloaded skills repo is empty",
			});
			expect(std.warn).toContain(
				"Downloaded Cloudflare skills repo appears empty"
			);
		});

		test("returns 'All agents already have skills installed' when skills already exist", async ({
			expect,
		}) => {
			const agentDir = createAgentDir(".claude");
			// Pre-populate the agent's skills directory with the same skill names
			// that giget will download
			mkdirSync(path.join(agentDir, "skills", "cloudflare"), {
				recursive: true,
			});
			mkdirSync(path.join(agentDir, "skills", "wrangler"), {
				recursive: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "All agents already have skills installed",
			});
		});

		test("returns 'Running in CI' when ci.isCI is true", async ({ expect }) => {
			createAgentDir(".claude");
			vi.mocked(ci).isCI = true;
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "Running in CI",
			});
			// Verify no network call was made
			expect(mockDownloadTemplate).not.toHaveBeenCalled();
		});

		test("returns 'Non-interactive terminal' when TTY is false", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			setIsTTY(false);
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "Non-interactive terminal",
			});
			expect(std.out).toContain(
				"Cloudflare agent skills are available for: Claude Code"
			);
			// Verify no network call was made
			expect(mockDownloadTemplate).not.toHaveBeenCalled();
		});
	});

	describe("user prompt interaction", () => {
		test("returns 'User declined' and writes metadata when user declines", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: false,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toEqual({
				skipped: true,
				reason: "User declined",
			});

			// must not log a success message when the user declined
			expect(std.out).not.toContain(
				"Successfully installed Cloudflare skills for:"
			);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(false);
			expect(metadata.date).toBeDefined();
		});

		test("copies skills to agent when user accepts", async ({ expect }) => {
			createAgentDir(".claude");
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			expect(result).toMatchObject({
				targetedAgents: expect.arrayContaining([
					expect.objectContaining({ name: "Claude Code" }),
				]),
			});
			assert(!("skipped" in result));

			const skillsDir = path.join(os.homedir(), ".claude", "skills");
			expect(existsSync(path.join(skillsDir, "cloudflare", "SKILL.md"))).toBe(
				true
			);
			expect(existsSync(path.join(skillsDir, "wrangler", "SKILL.md"))).toBe(
				true
			);

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);
		});

		test("force=true copies skills without prompting", async ({ expect }) => {
			createAgentDir(".claude");
			// No mockConfirm — if a prompt fires, the test will fail with "Unexpected call to prompts"
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(true);

			expect(result).toMatchObject({
				targetedAgents: expect.arrayContaining([
					expect.objectContaining({ name: "Claude Code" }),
				]),
			});

			const skillsDir = path.join(os.homedir(), ".claude", "skills");
			expect(existsSync(path.join(skillsDir, "cloudflare", "SKILL.md"))).toBe(
				true
			);

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);
		});
	});

	describe("multiple agents", () => {
		test("detects and installs skills for multiple agents", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			createAgentDir(".cursor");
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			assert(!("skipped" in result));
			const agentNames = result.targetedAgents.map((a) => a.name);
			expect(agentNames).toContain("Claude Code");
			expect(agentNames).toContain("Cursor");

			expect(
				existsSync(path.join(os.homedir(), ".claude", "skills", "cloudflare"))
			).toBe(true);
			expect(
				existsSync(path.join(os.homedir(), ".cursor", "skills", "cloudflare"))
			).toBe(true);

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code, Cursor."
			);
		});

		test("only targets agents missing skills, skips those that already have them", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			createAgentDir(".cursor");
			// Pre-populate Cursor with all skills so it doesn't need install
			const cursorSkills = path.join(os.homedir(), ".cursor", "skills");
			mkdirSync(path.join(cursorSkills, "cloudflare"), { recursive: true });
			mkdirSync(path.join(cursorSkills, "wrangler"), { recursive: true });

			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			assert(!("skipped" in result));
			const agentNames = result.targetedAgents.map((a) => a.name);
			expect(agentNames).toContain("Claude Code");
			expect(agentNames).not.toContain("Cursor");
		});
	});

	describe("copy failures", () => {
		test("reports partial copy failure and logs warning", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			createAgentDir(".cursor");

			// Make Cursor's skills path a file (not directory) so cpSync fails
			// when trying to write skill files into it
			const cursorSkillsParent = path.join(os.homedir(), ".cursor", "skills");
			mkdirSync(cursorSkillsParent, { recursive: true });
			const cursorBlockerFile = path.join(cursorSkillsParent, "cloudflare");
			// Create a file where a directory is expected — cpSync will fail
			writeFileSync(cursorBlockerFile, "blocker");

			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			assert(!("skipped" in result));
			expect(result.copyFailedFor).toBeDefined();
			expect(result.copyFailedFor).toEqual(
				expect.arrayContaining([expect.objectContaining({ name: "Cursor" })])
			);
			expect(
				existsSync(path.join(os.homedir(), ".claude", "skills", "cloudflare"))
			).toBe(true);

			expect(std.out).toContain(
				"Successfully installed Cloudflare skills for: Claude Code."
			);
			expect(std.warn).toContain(
				"Failed to install Cloudflare skills for some of the detected agents."
			);
		});

		test("logs generic warning when all copies fail", async ({ expect }) => {
			createAgentDir(".claude");

			// Block both skill directories for Claude
			const claudeSkillsParent = path.join(os.homedir(), ".claude", "skills");
			mkdirSync(claudeSkillsParent, { recursive: true });
			writeFileSync(path.join(claudeSkillsParent, "cloudflare"), "blocker");

			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			assert(!("skipped" in result));
			expect(result.copyFailedFor).toBeDefined();
			expect(result.copyFailedFor?.length).toBe(result.targetedAgents.length);

			expect(std.out).not.toContain(
				"Successfully installed Cloudflare skills for:"
			);
			expect(std.warn).toContain(
				"Failed to install Cloudflare skills for all the detected agents."
			);
		});
	});

	describe("metadata file", () => {
		test("writes metadata file with correct content when user accepts", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			await installCloudflareSkillsGlobally(false);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
			expect(metadata.detectedAgents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "Claude Code" }),
				])
			);
			expect(metadata.agentsNeedingInstall).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "Claude Code" }),
				])
			);
		});

		test("writes metadata file when user declines", async ({ expect }) => {
			createAgentDir(".claude");
			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: false,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			await installCloudflareSkillsGlobally(false);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(false);
		});

		test("includes copyFailedFor in metadata when copy fails", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			const claudeSkillsParent = path.join(os.homedir(), ".claude", "skills");
			mkdirSync(claudeSkillsParent, { recursive: true });
			writeFileSync(path.join(claudeSkillsParent, "cloudflare"), "blocker");

			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			await installCloudflareSkillsGlobally(false);

			const metadata = readMetadataFile();
			expect(metadata.accepted).toBe(true);
			expect(metadata.copyFailedFor).toBeDefined();
			expect(metadata.copyFailedFor).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "Claude Code" }),
				])
			);
		});
	});

	describe("agent detection with partial skills", () => {
		test("detects agent as needing install when only some skills are present", async ({
			expect,
		}) => {
			createAgentDir(".claude");
			// Only install one of two skills — agent should still be targeted
			const claudeSkills = path.join(os.homedir(), ".claude", "skills");
			mkdirSync(path.join(claudeSkills, "cloudflare"), { recursive: true });
			// Missing "wrangler" skill

			mockConfirm({
				text: expect.stringContaining("Claude Code") as unknown as string,
				result: true,
			});
			const installCloudflareSkillsGlobally = await freshImport();

			const result = await installCloudflareSkillsGlobally(false);

			assert(!("skipped" in result));
			expect(result.targetedAgents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "Claude Code" }),
				])
			);
		});
	});
});
