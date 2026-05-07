import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	getGlobalWranglerConfigPath,
	parseJSONC,
	removeDir,
} from "@cloudflare/workers-utils";
import ci from "ci-info";
import { downloadTemplate } from "giget";
import { confirm } from "./dialogs";
import isInteractive from "./is-interactive";
import { logger } from "./logger";

export type SkillsInstallSkipReason =
	| "Already prompted"
	| "No supported agents detected"
	| "Failed to download skills"
	| "Downloaded skills repo is empty"
	| "All agents already have skills installed"
	| "Running in CI"
	| "Non-interactive terminal"
	| "User declined";

export type SkillsInstallResult =
	| { skipped: true; reason: SkillsInstallSkipReason }
	| {
			targetedAgents: AgentInfo[];
			copyFailedFor?: (AgentInfo & {
				error: string;
			})[];
	  };

/**
 * Detects AI coding agents installed on the user's machine and offers to
 * install Cloudflare skill files into their global skills directories.
 *
 * Skills are downloaded dynamically from the `cloudflare/skills` GitHub
 * repository. The existence check verifies that all skill directories from
 * the repo are present — if any are missing, the agent is considered to need
 * an update.
 *
 * @param force - When `true` the interactive prompt is skipped and skills are
 *   installed unconditionally (used by `--experimental-force-skills-install`).
 */
export async function installCloudflareSkillsGlobally(
	force: boolean
): Promise<SkillsInstallResult> {
	// If the user has already been prompted, don't ask again
	const existingConfig = readSkillsInstallMetadataFile();
	if (existingConfig !== undefined && !force) {
		return { skipped: true, reason: "Already prompted" };
	}

	const configuredAgentsFound = supportedAgents.filter((agent) => {
		return existsSync(agent.globalPath);
	});

	if (configuredAgentsFound.length === 0) {
		return { skipped: true, reason: "No supported agents detected" };
	}

	if (ci.isCI) {
		// In CI environments, skip silently
		return { skipped: true, reason: "Running in CI" };
	}

	// In non-interactive terminals (but not CI), log a message
	if (!force && !isInteractive()) {
		logger.log(
			`Cloudflare agent skills are available for: ${configuredAgentsFound.map(({ name }) => name).join(", ")}. Run wrangler in an interactive terminal to install them, or use \`--experimental-force-skills-install\` to install without prompting.`
		);
		return { skipped: true, reason: "Non-interactive terminal" };
	}

	// Download skills from GitHub to a temp directory so we can discover
	// skill names dynamically and use them for both the existence check and install.
	const skillsTempDir = await downloadSkillsToTempDir();
	if (skillsTempDir === undefined) {
		return { skipped: true, reason: "Failed to download skills" };
	}

	try {
		const skillNames = getSkillNamesFromDir(skillsTempDir);
		if (skillNames.length === 0) {
			logger.warn(
				"Downloaded Cloudflare skills repo appears empty. Skipping installation."
			);
			return { skipped: true, reason: "Downloaded skills repo is empty" };
		}

		const agentsNeedingInstall = configuredAgentsFound.filter((agent) => {
			return !agentHasAllSkills(agent.globalSkillsPath, skillNames);
		});

		if (agentsNeedingInstall.length === 0) {
			return {
				skipped: true,
				reason: "All agents already have skills installed",
			};
		}

		const accepted =
			force ||
			(await confirm(
				`Wrangler detected configuration directories for the following AI coding agents without Cloudflare skills: ${agentsNeedingInstall.map(({ name }) => name).join(", ")}. Would you like to install them?`,
				{ defaultValue: true, fallbackValue: false }
			));

		let copyFailedFor:
			| (AgentInfo & {
					error: string;
			  })[]
			| undefined = undefined;
		if (accepted) {
			for (const agent of agentsNeedingInstall) {
				try {
					copySkillsToAgent(skillsTempDir, agent.globalSkillsPath, skillNames);
				} catch (err) {
					const error = `${err instanceof Error ? err.message : err}`;
					copyFailedFor ??= [];
					copyFailedFor.push({
						...agent,
						error,
					});
				}
			}
		}

		const failedNames = new Set(copyFailedFor?.map(({ name }) => name));
		const succeededAgents = agentsNeedingInstall.filter(
			(agent) => !failedNames.has(agent.name)
		);

		if (accepted && succeededAgents.length > 0) {
			logger.log(
				`Successfully installed Cloudflare skills for: ${succeededAgents.map(({ name }) => name).join(", ")}.`
			);
		}

		if (copyFailedFor && copyFailedFor.length > 0) {
			logger.warn(
				`Failed to install Cloudflare skills for ${succeededAgents.length === 0 ? "all" : "some of"} the detected agents. You can retry by passing \`--experimental-force-skills-install\` to your next wrangler command.`
			);
		}

		writeSkillsInstallMetadataFile({
			accepted,
			date: new Date().toISOString(),
			detectedAgents: configuredAgentsFound,
			agentsNeedingInstall: agentsNeedingInstall,
			...(copyFailedFor ? { copyFailedFor } : {}),
		});

		if (!accepted) {
			return { skipped: true, reason: "User declined" };
		}

		return {
			targetedAgents: agentsNeedingInstall,
			...(copyFailedFor ? { copyFailedFor } : {}),
		};
	} finally {
		// Clean up the temp directory (fire-and-forget, errors suppressed)
		removeDir(skillsTempDir, { fireAndForget: true });
	}
}

/**
 * Describes a supported AI coding agent and the filesystem paths Wrangler uses to detect it and install Cloudflare skills.
 */
type AgentInfo = {
	/** (Human readable) name of the agent (e.g. "Cursor", "Claude Code"). */
	name: string;
	/** Absolute path to the agent's global configuration directory. Its existence signals the agent is installed. */
	globalPath: string;
	/** Absolute path to the directory where Cloudflare skill files should be copied for this agent. */
	globalSkillsPath: string;
};

/**
 * Persisted configuration that tracks whether the user has been prompted
 * about installing Cloudflare agent skills globally.
 */
interface SkillsInstallMetadata {
	/** Whether the user accepted the prompt to create the skills directory. */
	accepted: boolean;
	/** ISO date string of when the user was prompted. */
	date: string;
	/** All agents detected on the user's machine (globalPath exists). */
	detectedAgents?: AgentInfo[];
	/** Agents that were missing some or all skills and were targeted for installation. */
	agentsNeedingInstall?: AgentInfo[];
	/** Agents for which the skill copy failed, if any. */
	copyFailedFor?: (AgentInfo & {
		error: string;
	})[];
}

/** Jsonc metadata file created when Cloudflare agent skills are installed */
const SKILLS_INSTALL_METADATA_FILENAME = "agents-skills-install.jsonc";

/** giget source for the skills subdirectory of the cloudflare/skills repo */
const SKILLS_REPO_SOURCE = "gh:cloudflare/skills/skills";

/**
 * Returns the absolute path to the skills install config file within the global wrangler config directory.
 *
 * @returns Absolute path to the `agents-skills-install.jsonc` file.
 */
function getSkillsInstallMetadataFilePath(): string {
	return path.resolve(
		getGlobalWranglerConfigPath(),
		SKILLS_INSTALL_METADATA_FILENAME
	);
}

/**
 * List of AI coding agents that support global skill installation.
 *
 * Each entry maps an agent's display name to its global configuration path
 * (`globalPath`) and the skills subdirectory within it (`globalSkillsPath`).
 * Wrangler checks for the existence of `globalPath` to detect which agents
 * are installed on the user's machine, then creates `globalSkillsPath`
 * (recursively) if needed before copying Cloudflare skill files into it.
 */
const supportedAgents: AgentInfo[] = [
	{
		name: "AiderDesk",
		globalPath: path.join(os.homedir(), ".aider-desk"),
		globalSkillsPath: path.join(os.homedir(), ".aider-desk", "skills"),
	},
	{
		name: "Amp, Kimi Code CLI, Replit, Universal",
		globalPath: path.join(os.homedir(), ".config", "agents"),
		globalSkillsPath: path.join(os.homedir(), ".config", "agents", "skills"),
	},
	{
		name: "Antigravity",
		globalPath: path.join(os.homedir(), ".gemini", "antigravity"),
		globalSkillsPath: path.join(
			os.homedir(),
			".gemini",
			"antigravity",
			"skills"
		),
	},
	{
		name: "Augment",
		globalPath: path.join(os.homedir(), ".augment"),
		globalSkillsPath: path.join(os.homedir(), ".augment", "skills"),
	},
	{
		name: "IBM Bob",
		globalPath: path.join(os.homedir(), ".bob"),
		globalSkillsPath: path.join(os.homedir(), ".bob", "skills"),
	},
	{
		name: "Claude Code",
		globalPath: path.join(os.homedir(), ".claude"),
		globalSkillsPath: path.join(os.homedir(), ".claude", "skills"),
	},
	{
		name: "OpenClaw",
		globalPath: path.join(os.homedir(), ".openclaw"),
		globalSkillsPath: path.join(os.homedir(), ".openclaw", "skills"),
	},
	{
		name: "Cline, Dexto, Warp",
		globalPath: path.join(os.homedir(), ".agents"),
		globalSkillsPath: path.join(os.homedir(), ".agents", "skills"),
	},
	{
		name: "CodeArts Agent",
		globalPath: path.join(os.homedir(), ".codeartsdoer"),
		globalSkillsPath: path.join(os.homedir(), ".codeartsdoer", "skills"),
	},
	{
		name: "CodeBuddy",
		globalPath: path.join(os.homedir(), ".codebuddy"),
		globalSkillsPath: path.join(os.homedir(), ".codebuddy", "skills"),
	},
	{
		name: "Codemaker",
		globalPath: path.join(os.homedir(), ".codemaker"),
		globalSkillsPath: path.join(os.homedir(), ".codemaker", "skills"),
	},
	{
		name: "Code Studio",
		globalPath: path.join(os.homedir(), ".codestudio"),
		globalSkillsPath: path.join(os.homedir(), ".codestudio", "skills"),
	},
	{
		name: "Codex",
		globalPath: path.join(os.homedir(), ".codex"),
		globalSkillsPath: path.join(os.homedir(), ".codex", "skills"),
	},
	{
		name: "Command Code",
		globalPath: path.join(os.homedir(), ".commandcode"),
		globalSkillsPath: path.join(os.homedir(), ".commandcode", "skills"),
	},
	{
		name: "Continue",
		globalPath: path.join(os.homedir(), ".continue"),
		globalSkillsPath: path.join(os.homedir(), ".continue", "skills"),
	},
	{
		name: "Cortex Code",
		globalPath: path.join(os.homedir(), ".snowflake", "cortex"),
		globalSkillsPath: path.join(os.homedir(), ".snowflake", "cortex", "skills"),
	},
	{
		name: "Crush",
		globalPath: path.join(os.homedir(), ".config", "crush"),
		globalSkillsPath: path.join(os.homedir(), ".config", "crush", "skills"),
	},
	{
		name: "Cursor",
		globalPath: path.join(os.homedir(), ".cursor"),
		globalSkillsPath: path.join(os.homedir(), ".cursor", "skills"),
	},
	{
		name: "Deep Agents",
		globalPath: path.join(os.homedir(), ".deepagents"),
		globalSkillsPath: path.join(os.homedir(), ".deepagents", "agent", "skills"),
	},
	{
		name: "Devin for Terminal",
		globalPath: path.join(os.homedir(), ".config", "devin"),
		globalSkillsPath: path.join(os.homedir(), ".config", "devin", "skills"),
	},
	{
		name: "Droid",
		globalPath: path.join(os.homedir(), ".factory"),
		globalSkillsPath: path.join(os.homedir(), ".factory", "skills"),
	},
	{
		name: "Firebender",
		globalPath: path.join(os.homedir(), ".firebender"),
		globalSkillsPath: path.join(os.homedir(), ".firebender", "skills"),
	},
	{
		name: "ForgeCode",
		globalPath: path.join(os.homedir(), ".forge"),
		globalSkillsPath: path.join(os.homedir(), ".forge", "skills"),
	},
	{
		name: "Gemini CLI",
		globalPath: path.join(os.homedir(), ".gemini"),
		globalSkillsPath: path.join(os.homedir(), ".gemini", "skills"),
	},
	{
		name: "GitHub Copilot",
		globalPath: path.join(os.homedir(), ".copilot"),
		globalSkillsPath: path.join(os.homedir(), ".copilot", "skills"),
	},
	{
		name: "Goose",
		globalPath: path.join(os.homedir(), ".config", "goose"),
		globalSkillsPath: path.join(os.homedir(), ".config", "goose", "skills"),
	},
	{
		name: "Hermes Agent",
		globalPath: path.join(os.homedir(), ".hermes"),
		globalSkillsPath: path.join(os.homedir(), ".hermes", "skills"),
	},
	{
		name: "Junie",
		globalPath: path.join(os.homedir(), ".junie"),
		globalSkillsPath: path.join(os.homedir(), ".junie", "skills"),
	},
	{
		name: "iFlow CLI",
		globalPath: path.join(os.homedir(), ".iflow"),
		globalSkillsPath: path.join(os.homedir(), ".iflow", "skills"),
	},
	{
		name: "Kilo Code",
		globalPath: path.join(os.homedir(), ".kilocode"),
		globalSkillsPath: path.join(os.homedir(), ".kilocode", "skills"),
	},
	{
		name: "Kiro CLI",
		globalPath: path.join(os.homedir(), ".kiro"),
		globalSkillsPath: path.join(os.homedir(), ".kiro", "skills"),
	},
	{
		name: "Kode",
		globalPath: path.join(os.homedir(), ".kode"),
		globalSkillsPath: path.join(os.homedir(), ".kode", "skills"),
	},
	{
		name: "MCPJam",
		globalPath: path.join(os.homedir(), ".mcpjam"),
		globalSkillsPath: path.join(os.homedir(), ".mcpjam", "skills"),
	},
	{
		name: "Mistral Vibe",
		globalPath: path.join(os.homedir(), ".vibe"),
		globalSkillsPath: path.join(os.homedir(), ".vibe", "skills"),
	},
	{
		name: "Mux",
		globalPath: path.join(os.homedir(), ".mux"),
		globalSkillsPath: path.join(os.homedir(), ".mux", "skills"),
	},
	{
		name: "OpenCode",
		globalPath: path.join(os.homedir(), ".config", "opencode"),
		globalSkillsPath: path.join(os.homedir(), ".config", "opencode", "skills"),
	},
	{
		name: "OpenHands",
		globalPath: path.join(os.homedir(), ".openhands"),
		globalSkillsPath: path.join(os.homedir(), ".openhands", "skills"),
	},
	{
		name: "Pi",
		globalPath: path.join(os.homedir(), ".pi"),
		globalSkillsPath: path.join(os.homedir(), ".pi", "agent", "skills"),
	},
	{
		name: "Qoder",
		globalPath: path.join(os.homedir(), ".qoder"),
		globalSkillsPath: path.join(os.homedir(), ".qoder", "skills"),
	},
	{
		name: "Qwen Code",
		globalPath: path.join(os.homedir(), ".qwen"),
		globalSkillsPath: path.join(os.homedir(), ".qwen", "skills"),
	},
	{
		name: "Rovo Dev",
		globalPath: path.join(os.homedir(), ".rovodev"),
		globalSkillsPath: path.join(os.homedir(), ".rovodev", "skills"),
	},
	{
		name: "Roo Code",
		globalPath: path.join(os.homedir(), ".roo"),
		globalSkillsPath: path.join(os.homedir(), ".roo", "skills"),
	},
	{
		name: "Tabnine CLI",
		globalPath: path.join(os.homedir(), ".tabnine"),
		globalSkillsPath: path.join(os.homedir(), ".tabnine", "agent", "skills"),
	},
	{
		name: "Trae",
		globalPath: path.join(os.homedir(), ".trae"),
		globalSkillsPath: path.join(os.homedir(), ".trae", "skills"),
	},
	{
		name: "Trae CN",
		globalPath: path.join(os.homedir(), ".trae-cn"),
		globalSkillsPath: path.join(os.homedir(), ".trae-cn", "skills"),
	},
	{
		name: "Windsurf",
		globalPath: path.join(os.homedir(), ".codeium", "windsurf"),
		globalSkillsPath: path.join(os.homedir(), ".codeium", "windsurf", "skills"),
	},
	{
		name: "Zencoder",
		globalPath: path.join(os.homedir(), ".zencoder"),
		globalSkillsPath: path.join(os.homedir(), ".zencoder", "skills"),
	},
	{
		name: "Neovate",
		globalPath: path.join(os.homedir(), ".neovate"),
		globalSkillsPath: path.join(os.homedir(), ".neovate", "skills"),
	},
	{
		name: "Pochi",
		globalPath: path.join(os.homedir(), ".pochi"),
		globalSkillsPath: path.join(os.homedir(), ".pochi", "skills"),
	},
	{
		name: "AdaL",
		globalPath: path.join(os.homedir(), ".adal"),
		globalSkillsPath: path.join(os.homedir(), ".adal", "skills"),
	},
];

/**
 * Reads and parses the skills install metadata file.
 *
 * @returns The parsed metadata file, or `undefined` if the file doesn't exist or can't be parsed.
 */
function readSkillsInstallMetadataFile(): SkillsInstallMetadata | undefined {
	try {
		const content = readFileSync(getSkillsInstallMetadataFilePath(), "utf8");
		return parseJSONC(content) as SkillsInstallMetadata;
	} catch {
		return undefined;
	}
}

/**
 * Persists the skills install metadata to disk, creating parent directories as needed.
 *
 * @param metadata - The metadata to write.
 */
function writeSkillsInstallMetadataFile(metadata: SkillsInstallMetadata): void {
	const configPath = getSkillsInstallMetadataFilePath();
	mkdirSync(path.dirname(configPath), { recursive: true });
	writeFileSync(configPath, JSON.stringify(metadata, null, "\t"));
}

/**
 * Downloads the Cloudflare skills from the `cloudflare/skills` GitHub repo
 * into a temporary directory using giget (tarball mode, no git required).
 *
 * @returns The path to the temp directory containing the downloaded skill
 *   directories, or `undefined` if the download failed.
 */
async function downloadSkillsToTempDir(): Promise<string | undefined> {
	try {
		const tmpDir = await mkdtemp(
			path.join(os.tmpdir(), "wrangler-skills-install-")
		);
		await downloadTemplate(SKILLS_REPO_SOURCE, {
			dir: tmpDir,
			force: true,
			registry: false,
		});
		return tmpDir;
	} catch (err) {
		logger.warn(
			`Failed to download Cloudflare skills from GitHub: ${err instanceof Error ? err.message : String(err)}`
		);
		return undefined;
	}
}

/**
 * Reads the top-level directory names from the downloaded skills temp directory.
 * Each directory name corresponds to a skill (e.g. "cloudflare", "wrangler", "agents-sdk").
 *
 * @param skillsTempDir - Path to the temp directory containing downloaded skills.
 * @returns Array of skill directory names.
 */
function getSkillNamesFromDir(skillsTempDir: string): string[] {
	return readdirSync(skillsTempDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

/**
 * Checks whether an agent's skills directory contains all of the given skill names.
 *
 * @param agentSkillsPath - The agent's global skills directory.
 * @param skillNames - The skill directory names to check for.
 * @returns `true` if every skill directory exists, `false` otherwise.
 */
function agentHasAllSkills(
	agentSkillsPath: string,
	skillNames: string[]
): boolean {
	try {
		const entries = new Set(readdirSync(agentSkillsPath));
		return skillNames.every((name) => entries.has(name));
	} catch {
		return false;
	}
}

/**
 * Copies all skill directories from the temp directory into an agent's skills path.
 *
 * @param skillsTempDir - Path to the temp directory containing downloaded skills.
 * @param agentSkillsPath - The agent's global skills directory to copy into.
 * @param skillNames - The skill directory names to copy.
 */
function copySkillsToAgent(
	skillsTempDir: string,
	agentSkillsPath: string,
	skillNames: string[]
): void {
	mkdirSync(agentSkillsPath, { recursive: true });
	for (const skillName of skillNames) {
		const src = path.join(skillsTempDir, skillName);
		const dest = path.join(agentSkillsPath, skillName);
		mkdirSync(dest, { recursive: true });
		cpSync(src, dest, { recursive: true });
	}
}
