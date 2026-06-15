import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	getGlobalWranglerConfigPath,
	parseJSONC,
} from "@cloudflare/workers-utils";
import { detectAgenticEnvironment } from "am-i-vibing";
import ci from "ci-info";
import { install as rosieInstall, agents as rosieAgents } from "rosie-skills";
import { fetch } from "undici";
import { confirm } from "./dialogs";
import isInteractive from "./is-interactive";
import { logger } from "./logger";
import { sendMetricsEvent } from "./metrics";

/**
 * Options for {@link runSkillsInstallFlow}.
 *
 * When `force` is `true`, the interactive prompt is skipped entirely so no
 * `promptMessage` is needed. When `force` is `false`, a `promptMessage`
 * function must be provided to generate the confirmation prompt shown to the user.
 */
type SkillsInstallFlowOptions =
	| {
			/** Skip the interactive prompt and install unconditionally. Metadata and CI checks are also bypassed. */
			force: true;
			/**
			 * The wrangler command that triggered the skills install flow
			 * (e.g. `"deploy"`, `"dev"`). Included in telemetry events so
			 * we can correlate skills installs with the commands that prompted them.
			 */
			command?: string;
	  }
	| {
			/** Show the interactive prompt before installing. */
			force: false;
			/**
			 * The wrangler command that triggered the skills install flow
			 * (e.g. `"deploy"`, `"dev"`). Included in telemetry events so
			 * we can correlate skills installs with the commands that prompted them.
			 */
			command?: string;
			/**
			 * Returns the confirmation prompt message shown to the user.
			 *
			 * @param agentNames - Display names of the detected agents.
			 * @returns The prompt string passed to {@link confirm}.
			 */
			promptMessage: (agentNames: string[]) => string;
	  };

/**
 * Shared implementation for skills installation flows. Handles guard checks
 * (metadata, CI, agent detection, interactivity), prompts the user with a
 * caller-provided message, and performs the installation via rosie.
 *
 * @param options - Controls whether to force-install and what prompt to show.
 */
export async function runSkillsInstallFlow(
	options: SkillsInstallFlowOptions
): Promise<void> {
	const { force, command } = options;

	const sendResultMetricsEvent = (
		result:
			| { skippedBecause: string; errorMessage?: string }
			| {
					targetedAgents: AgentInfo[];
			  }
	) => {
		if ("skippedBecause" in result) {
			sendMetricsEvent(
				"skills_install_skipped",
				{
					reason: result.skippedBecause,
					...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
					...(command ? { command } : {}),
				},
				{}
			);
		} else {
			sendMetricsEvent(
				"skills_install_completed",
				{
					agents: result.targetedAgents,
					...(command ? { command } : {}),
				},
				{}
			);
		}
	};

	// If the user has already been prompted, don't ask again
	const existingConfig = readSkillsInstallMetadataFile();
	if (existingConfig !== undefined && !force) {
		// Note: no metrics event is sent in this case
		return;
	}

	if (ci.isCI && !force) {
		// In CI environments, skip silently
		sendResultMetricsEvent({ skippedBecause: "Running in CI" });
		return;
	}

	let detectedAgents: AgentInfo[];
	try {
		detectedAgents = await getDetectedAgents();
	} catch (err) {
		sendResultMetricsEvent({
			skippedBecause: "Failed to install skills",
			errorMessage: err instanceof Error ? err.message : String(err),
		});
		return;
	}

	if (detectedAgents.length === 0) {
		sendResultMetricsEvent({
			skippedBecause: "No supported agents detected",
		});
		return;
	}

	// In non-interactive terminals do nothing
	if (!force && !isInteractive()) {
		sendResultMetricsEvent({
			skippedBecause: "Non-interactive terminal",
		});
		return;
	}

	let accepted: boolean;
	if (force) {
		accepted = true;
	} else {
		// Persist an "unanswered" marker *before* showing the prompt so that if
		// the user interrupts the process (CTRL+C, terminal closed, etc.) the
		// metadata file already exists and the prompt won't reappear next time.
		writeSkillsInstallMetadataFile({
			version: 1,
			accepted: "unanswered",
			date: new Date().toISOString(),
			detectedAgents,
		});

		logger.log();

		const agentDisplayNames = detectedAgents.map(({ name }) => name);
		accepted = await confirm(options.promptMessage(agentDisplayNames), {
			defaultValue: true,
			fallbackValue: false,
		});
	}

	if (!accepted) {
		writeSkillsInstallMetadataFile({
			version: 1,
			accepted: false,
			date: new Date().toISOString(),
			detectedAgents,
		});
		sendResultMetricsEvent({ skippedBecause: "User declined" });
		return;
	}

	try {
		const agentNames = detectedAgents.map((a) => a.rosie.id);
		const { failedAgents } = await rosieInstall(SKILLS_REPO, {
			global: true,
			agent: agentNames,
			lockfile: false,
			// rosie shows a bunch of extra logs regarding the installation
			// we do not want to show them as standard output so we just log
			// them at the debug level
			onLog: ({ message }) => logger.debug(message),
		});

		const failedSet = new Set(failedAgents);
		const succeededAgents = detectedAgents.filter(
			(a) => !failedSet.has(a.rosie.id)
		);

		if (succeededAgents.length > 0) {
			logger.log(
				`\n🚀 Successfully installed Cloudflare skills for: ${succeededAgents.map(({ name }) => name).join(", ")}.\n`
			);
		}

		if (failedAgents.length > 0) {
			logger.log();
			logger.warn(
				`Skills installation failed for agents: ${failedAgents.join(", ")}.`
			);
			logger.warn(SKILLS_INSTALL_RETRY_HINT);
		}

		writeSkillsInstallMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents,
			installFailed: failedAgents.length > 0 ? failedAgents : false,
		});

		sendResultMetricsEvent({
			targetedAgents: succeededAgents,
		});
		return;
	} catch (err) {
		logger.warn(
			`Failed to install Cloudflare skills: ${err instanceof Error ? err.message : String(err)}`
		);
		logger.warn(SKILLS_INSTALL_RETRY_HINT);

		writeSkillsInstallMetadataFile({
			version: 1,
			accepted: true,
			date: new Date().toISOString(),
			detectedAgents,
			installFailed: true,
		});

		sendResultMetricsEvent({
			skippedBecause: "Failed to install skills",
		});
	}
}

/**
 * Builds the confirmation prompt shown to the user after a wrangler command
 * completes, asking whether to install Cloudflare skills for detected AI
 * coding agents.
 *
 * Used as the {@link SkillsInstallFlowOptions.promptMessage} callback when
 * skills installation is suggested via `suggestSkillsAfterHandler`.
 *
 * @param agentNames - Display names of the detected AI coding agents
 *   (e.g. `["Claude Code", "Cursor"]`).
 * @returns The formatted confirmation prompt string passed to {@link confirm}.
 */
export function skillInstallPromptMessageAfterWranglerCommandHandler(
	agentNames: string[]
): string {
	return `Before you go, Wrangler detected AI coding agents that may not be best configured to work with Cloudflare: ${agentNames.join(", ")}. Would you like Wrangler to automatically install Cloudflare skills for the best experience?`;
}

/** The GitHub repo spec for Cloudflare skills, used with rosie.install(). */
const SKILLS_REPO = "cloudflare/skills";

/** Actionable hint appended to skills-install failure warnings, directing users to retry or install manually. */
const SKILLS_INSTALL_RETRY_HINT =
	"You can retry by running `wrangler --install-skills`, or install skills manually as described here: https://github.com/cloudflare/skills#installing";

/**
 * Describes a detected AI coding agent.
 */
type AgentInfo = {
	/** Human-readable display name of the agent (e.g. "Claude Code"). */
	name: string;
	/** Rosie agent metadata. */
	rosie: {
		/** Rosie's short identifier for the agent (e.g. "claude"). */
		id: string;
		/** Absolute path to the agent's global skills directory. */
		globalPath: string;
	};
};

/**
 * Persisted configuration that tracks whether the user has been prompted
 * about installing Cloudflare agent skills globally.
 */
interface SkillsInstallMetadata {
	/** Schema version for forward-compatibility. Currently always `1`. */
	version: 1;
	/**
	 * Whether the user accepted the prompt to install skills.
	 *
	 * - `true`  — the user accepted and installation was attempted.
	 * - `false` — the user explicitly declined.
	 * - `"unanswered"` — the metadata file was written before the prompt was
	 *   shown but the user never answered (e.g. CTRL+C, terminal closed).
	 *   Treated the same as a decline for the purpose of suppressing future
	 *   prompts.
	 */
	accepted: boolean | "unanswered";
	/** ISO date string of when the user was prompted. */
	date: string;
	/** All agents detected on the user's machine. */
	detectedAgents?: AgentInfo[];
	/**
	 * `true` when the entire `rosie.install()` call threw, or `string[]` with
	 * the names of agents whose symlinks could not be created. `false` if
	 * installation succeeded for all agents. Absent when no installation was
	 * attempted (user declined or prompt was skipped).
	 */
	installFailed?: boolean | string[];
}

/** Jsonc metadata file created when Cloudflare agent skills are installed */
const SKILLS_INSTALL_METADATA_FILENAME = "agents-skills-install.jsonc";

/** GitHub Contents API URL for listing skill directories in the cloudflare/skills repo. */
const SKILLS_REPO_CONTENTS_URL =
	"https://api.github.com/repos/cloudflare/skills/contents/skills";

/** Cache filename for skill directory names fetched from the GitHub API. */
const SKILLS_REPO_CACHE_FILENAME = "cloudflare-skills-repo-cache.json";

/** Time-to-live for the cached skill names (24 hours in milliseconds). */
const SKILLS_REPO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the absolute path to the skills install config file within the global wrangler config directory.
 */
function getSkillsInstallMetadataFilePath(): string {
	return path.resolve(
		getGlobalWranglerConfigPath(),
		SKILLS_INSTALL_METADATA_FILENAME
	);
}

/**
 * Returns the absolute path to the skills repo cache file within the global wrangler config directory.
 */
function getSkillsRepoCachePath(): string {
	return path.resolve(
		getGlobalWranglerConfigPath(),
		SKILLS_REPO_CACHE_FILENAME
	);
}

/**
 * Legacy shape of `AgentInfo` written by Wrangler versions before the
 * `version: 1` schema was introduced. The agent's rosie ID and global
 * skills path were stored as flat properties instead of being nested
 * under a `rosie` object.
 */
interface LegacyAgentInfo {
	name: string;
	rosieId: string;
	globalSkillsPath: string;
}

/**
 * Legacy shape of the skills-install metadata file written by Wrangler
 * versions before the `version: 1` schema was introduced. It lacks the
 * `version` field and uses {@link LegacyAgentInfo} instead of {@link AgentInfo}.
 */
interface LegacySkillsInstallMetadata {
	accepted: boolean;
	date: string;
	detectedAgents?: LegacyAgentInfo[];
	installFailed?: boolean | string[];
}

// TODO(dario): Remove `migrateMetadataToV1` and the legacy types above after
// 2026-06-05 — by then most active users' metadata files will have been
// converted to the version-1 schema.
/**
 * Converts a legacy (pre-version-1) metadata object to the current schema.
 * The old format stored `rosieId` / `globalSkillsPath` as flat properties on
 * each agent entry; the new format nests them under `rosie: { id, globalPath }`.
 */
function migrateMetadataToV1(
	old: LegacySkillsInstallMetadata
): SkillsInstallMetadata {
	return {
		version: 1,
		accepted: old.accepted,
		date: old.date,
		detectedAgents: old.detectedAgents?.map((agent) => ({
			name: agent.name,
			rosie: {
				id: agent.rosieId,
				globalPath: agent.globalSkillsPath,
			},
		})),
		installFailed: old.installFailed,
	};
}

/**
 * Reads and parses the skills install metadata file.
 *
 * If the file uses the legacy schema (no `version` field), it is automatically
 * migrated to the current version-1 format and overwritten on disk.
 *
 * @returns The parsed metadata file, or `undefined` if the file doesn't exist or can't be parsed.
 */
function readSkillsInstallMetadataFile(): SkillsInstallMetadata | undefined {
	try {
		const content = readFileSync(getSkillsInstallMetadataFilePath(), "utf8");
		const parsed = parseJSONC(content) as Record<string, unknown>;

		// TODO(dario): Remove this migration branch after 2026-06-05 — by then
		// most active users' metadata files will have been converted to version 1.
		if ((parsed as { version?: unknown }).version === undefined) {
			const migrated = migrateMetadataToV1(
				parsed as unknown as LegacySkillsInstallMetadata
			);
			writeSkillsInstallMetadataFile(migrated);
			return migrated;
		}

		return parsed as unknown as SkillsInstallMetadata;
	} catch {
		return undefined;
	}
}

/**
 * Persists the skills install metadata to disk, creating parent directories as needed.
 */
function writeSkillsInstallMetadataFile(metadata: SkillsInstallMetadata): void {
	const configPath = getSkillsInstallMetadataFilePath();
	mkdirSync(path.dirname(configPath), { recursive: true });
	writeFileSync(configPath, JSON.stringify(metadata, null, "\t"));
}

/** On-disk cache for skill directory names fetched from the GitHub Contents API. */
interface SkillsRepoCache {
	/** Unix-epoch millisecond timestamp of when the cache was last written. */
	lastUpdate: number;
	/** Skill directory names from the `cloudflare/skills` repository. */
	skillNames: string[];
}

/**
 * Reads the cached skill names from disk, returning them only if the cache has not expired.
 * Falls back to stale data when {@link allowStale} is true (e.g. after a failed network request).
 *
 * @param allowStale When `true`, returns cached data even if the TTL has expired.
 * @returns Array of cached skill names, or `undefined` on cache miss.
 */
function readSkillsRepoCache(allowStale = false): string[] | undefined {
	try {
		const raw = readFileSync(getSkillsRepoCachePath(), "utf8");
		const cache = JSON.parse(raw) as SkillsRepoCache;
		if (
			allowStale ||
			cache.lastUpdate + SKILLS_REPO_CACHE_TTL_MS > Date.now()
		) {
			return cache.skillNames;
		}
	} catch {
		// Cache file missing, corrupt, or unreadable — treat as cache miss.
	}
	return undefined;
}

/**
 * Writes skill names to the disk cache with the current timestamp.
 *
 * @param skillNames The skill directory names to persist.
 */
function writeSkillsRepoCache(skillNames: string[]): void {
	try {
		const cachePath = getSkillsRepoCachePath();
		mkdirSync(path.dirname(cachePath), { recursive: true });
		const data: SkillsRepoCache = {
			lastUpdate: Date.now(),
			skillNames,
		};
		writeFileSync(cachePath, JSON.stringify(data));
	} catch {
		// Best-effort — cache write failure is non-fatal.
	}
}

/**
 * Fetches the list of skill directory names from the `cloudflare/skills` GitHub
 * repository using the GitHub Contents API. Results are cached to disk for 24 hours
 * to avoid hitting API rate limits.
 *
 * @returns Array of skill directory names, or `undefined` if both fetch and cache fail.
 */
async function fetchSkillNamesFromGitHub(): Promise<string[] | undefined> {
	// Return fresh cached data if available.
	const cached = readSkillsRepoCache();
	if (cached) {
		return cached;
	}

	try {
		const res = await fetch(SKILLS_REPO_CONTENTS_URL, {
			headers: {
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "cloudflare-wrangler",
			},
		});
		if (!res.ok) {
			// API error (rate limited, 404, etc.) — fall back to stale cache.
			return readSkillsRepoCache(true);
		}
		const entries = (await res.json()) as Array<{
			name: string;
			type: string;
		}>;
		const skillNames = entries
			.filter((e) => e.type === "dir")
			.map((e) => e.name);

		writeSkillsRepoCache(skillNames);
		return skillNames;
	} catch {
		// Network failure — fall back to stale cache.
		return readSkillsRepoCache(true);
	}
}

/**
 * Result of checking whether the current AI agent has Cloudflare skills installed.
 *
 * - `null` — no agent detected or the agent is not in the supported list.
 * - `false` — agent is supported but no skills are present on disk.
 * - `"automatic"` — skills are present and the metadata file confirms Wrangler installed them.
 * - `"manual"` — skills are present but were not installed by Wrangler (no metadata, agent not
 *                listed in metadata, or the metadata records a failure for this agent).
 */
type AgentSkillsInstallStatus = "automatic" | "manual" | false | null;

/**
 * Maps an `am-i-vibing` agent ID to its global skills paths (both the rosie
 * install path and any alternative paths the agent natively reads from).
 * This is used by the telemetry function to check whether skills exist on
 * disk without calling `rosie.agents()`, which loads WASM and is too slow
 * for process-startup telemetry.
 */
interface AmIVibingDataMappingEntry {
	/** `am-i-vibing` provider ID(s) that identify this agent. */
	amIVibingIds: string[];
	/**
	 * Rosie agent metadata.
	 *
	 * The `globalPath` is the absolute path to the agent's global skills
	 * directory, constructed via `path.join(os.homedir(), ...)` to match
	 * the `global_path` field in rosie's `AGENT_DEFS` registry.
	 * See: https://github.com/matthewp/rosie/blob/276939233/src/agent.rs#L26
	 */
	rosie: { globalPath: string };
	/**
	 * Additional absolute global skills paths where this agent natively
	 * reads skills from, beyond the rosie install path. Used to detect
	 * manual skill installations for telemetry. Only paths that differ
	 * from `rosie.globalPath` should be listed here.
	 *
	 * Sources for each agent's alternative paths are linked inline below.
	 */
	alternativeGlobalPaths?: string[];
}

/**
 * Static mapping from `am-i-vibing` agent IDs to their global skills paths,
 * used only for telemetry.
 *
 * The `amIVibingIds` are the provider IDs returned by the `am-i-vibing`
 * package's `detectAgenticEnvironment()` function.
 *
 * The `rosie.globalPath` values correspond to the `global_path` field from
 * rosie's agent registry, constructed as absolute paths via
 * `path.join(os.homedir(), ...)`:
 * https://github.com/matthewp/rosie/blob/2769392335/src/agent.rs#L26
 *
 * The `alternativeGlobalPaths` are additional absolute directories that
 * each agent natively reads skills from, sourced from the agent's official
 * documentation. These are used to detect manual skill installations for
 * telemetry.
 */
const amIVibingDataMapping: AmIVibingDataMappingEntry[] = [
	{
		// rosie name: "replit" / "amp" / "kimi-cli" / "universal"
		amIVibingIds: ["replit", "replit-assistant"],
		rosie: {
			globalPath: path.join(os.homedir(), ".config", "agents", "skills"),
		},
		// https://ampcode.com/manual#agent-skills
		alternativeGlobalPaths: [
			path.join(os.homedir(), ".config", "amp", "skills"),
			path.join(os.homedir(), ".claude", "skills"),
		],
	},
	{
		// rosie name: "claude"
		// https://code.claude.com/docs/en/skills — only ~/.claude/skills/ documented
		amIVibingIds: ["claude-code"],
		rosie: { globalPath: path.join(os.homedir(), ".claude", "skills") },
	},
	{
		// rosie name: "warp"
		// .agents/skills IS the rosie path; closed source, no other paths confirmed
		amIVibingIds: ["warp"],
		rosie: { globalPath: path.join(os.homedir(), ".agents", "skills") },
	},
	{
		// rosie name: "codex"
		amIVibingIds: ["codex"],
		rosie: { globalPath: path.join(os.homedir(), ".codex", "skills") },
		// https://developers.openai.com/codex/skills — $HOME/.agents/skills is the USER scope
		alternativeGlobalPaths: [path.join(os.homedir(), ".agents", "skills")],
	},
	{
		// rosie name: "crush"
		amIVibingIds: ["crush"],
		rosie: {
			globalPath: path.join(os.homedir(), ".config", "crush", "skills"),
		},
		// https://github.com/charmbracelet/crush?tab=readme-ov-file#agent-skills
		alternativeGlobalPaths: [
			path.join(os.homedir(), ".config", "agents", "skills"),
			path.join(os.homedir(), ".agents", "skills"),
			path.join(os.homedir(), ".claude", "skills"),
		],
	},
	{
		// rosie name: "cursor"
		amIVibingIds: ["cursor-agent", "cursor"],
		rosie: { globalPath: path.join(os.homedir(), ".cursor", "skills") },
		// https://cursor.com/docs/context/skills
		alternativeGlobalPaths: [
			path.join(os.homedir(), ".agents", "skills"),
			path.join(os.homedir(), ".claude", "skills"),
			path.join(os.homedir(), ".codex", "skills"),
		],
	},
	{
		// rosie name: "gemini-cli"
		amIVibingIds: ["gemini-agent"],
		rosie: { globalPath: path.join(os.homedir(), ".gemini", "skills") },
		// https://github.com/google-gemini/gemini-cli — Storage.getUserAgentSkillsDir()
		alternativeGlobalPaths: [path.join(os.homedir(), ".agents", "skills")],
	},
	{
		// rosie name: "copilot"
		amIVibingIds: ["vscode-copilot-agent"],
		rosie: { globalPath: path.join(os.homedir(), ".copilot", "skills") },
		// https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
		alternativeGlobalPaths: [path.join(os.homedir(), ".agents", "skills")],
	},
	{
		// rosie name: "opencode"
		amIVibingIds: ["opencode"],
		rosie: {
			globalPath: path.join(os.homedir(), ".config", "opencode", "skills"),
		},
		// https://opencode.ai/docs/skills
		alternativeGlobalPaths: [
			path.join(os.homedir(), ".opencode", "skills"),
			path.join(os.homedir(), ".claude", "skills"),
			path.join(os.homedir(), ".agents", "skills"),
		],
	},
	{
		// rosie name: "windsurf"
		// Closed source, no alternative global paths confirmed
		amIVibingIds: ["windsurf"],
		rosie: {
			globalPath: path.join(os.homedir(), ".codeium", "windsurf", "skills"),
		},
	},
];

/**
 * Checks whether a directory contains at least one of the given skill names.
 *
 * @param dirPath - Absolute path to a skills directory.
 * @param skillNames - Skill directory names to look for.
 * @returns `true` if at least one skill name is present, `false` otherwise
 *   (including when the directory does not exist or is unreadable).
 */
function directoryContainsAnySkill(
	dirPath: string,
	skillNames: string[]
): boolean {
	try {
		const entries = new Set(readdirSync(dirPath));
		return skillNames.some((name) => entries.has(name));
	} catch {
		return false;
	}
}

/**
 * Determines whether the currently-running AI coding agent has Cloudflare
 * skills installed. This runs asynchronously and is intended to be started
 * eagerly on process startup so the result is available by the time
 * telemetry events are dispatched.
 *
 * @returns The {@link AgentSkillsInstallStatus} for the current agent.
 */
async function computeTelemetryCurrentAgentSkillsInstalled(): Promise<AgentSkillsInstallStatus> {
	let agentId: string | null = null;
	try {
		const detection = detectAgenticEnvironment(process.env, []);
		agentId = detection.id;
	} catch {
		return null;
	}
	if (!agentId) {
		return null;
	}

	const mapping = amIVibingDataMapping.find((a) =>
		a.amIVibingIds.includes(agentId)
	);
	if (!mapping) {
		return null;
	}

	const globalSkillsPath = path.resolve(mapping.rosie.globalPath);

	const skillNames = await fetchSkillNamesFromGitHub();
	if (!skillNames || skillNames.length === 0) {
		return false;
	}

	// Check whether any Cloudflare skill exists at the primary rosie path.
	const hasSkillsAtPrimary = directoryContainsAnySkill(
		globalSkillsPath,
		skillNames
	);

	if (!hasSkillsAtPrimary) {
		// Skills not at the primary path — check alternative global paths that
		// this agent natively reads from.
		const matchedAlternativePath = (mapping.alternativeGlobalPaths ?? []).find(
			(altPath) => directoryContainsAnySkill(path.resolve(altPath), skillNames)
		);
		if (!matchedAlternativePath) {
			return false;
		}

		// Skills exist at an alternative path. Check whether Wrangler
		// installed them there for a different agent whose rosie globalPath
		// happens to match this alternative path (e.g. OpenCode reads
		// ~/.agents/skills, which is Warp's rosie install target).
		const metadata = readSkillsInstallMetadataFile();
		if (metadata?.accepted === true) {
			const altAbsPath = path.resolve(matchedAlternativePath);
			const wasInstalledForAnotherAgent = metadata.detectedAgents?.some(
				(agent) => {
					if (path.resolve(agent.rosie.globalPath) !== altAbsPath) {
						return false;
					}
					// Ensure the install didn't fail for that agent.
					if (metadata.installFailed === true) {
						return false;
					}
					if (Array.isArray(metadata.installFailed)) {
						return !metadata.installFailed.includes(agent.rosie.id);
					}
					return true;
				}
			);
			if (wasInstalledForAnotherAgent) {
				return "automatic";
			}
		}
		return "manual";
	}

	const metadata = readSkillsInstallMetadataFile();
	if (!metadata) {
		return "manual";
	}

	// Check if this agent was part of the Wrangler-driven install.
	const isInDetectedAgents = metadata.detectedAgents?.some(
		(agent) => path.resolve(agent.rosie.globalPath) === globalSkillsPath
	);

	// Check if the install failed for this agent.
	// installFailed is `true` when the whole rosie.install() threw, `string[]` with
	// rosie agent names on partial failure, or `false` on success.
	const installFailedForAgent =
		metadata.installFailed === true ||
		(Array.isArray(metadata.installFailed) &&
			metadata.detectedAgents?.some(
				(agent) =>
					path.resolve(agent.rosie.globalPath) === globalSkillsPath &&
					(metadata.installFailed as string[]).includes(agent.rosie.id)
			));

	if (
		metadata.accepted === true &&
		isInDetectedAgents === true &&
		!installFailedForAgent
	) {
		return "automatic";
	}
	return "manual";
}

/** Lazily-initialised singleton promise used to memoise {@link telemetryCurrentAgentSkillsInstalled}. */
let _telemetryPromise: Promise<AgentSkillsInstallStatus> | undefined;

/**
 * Returns a memoised promise that resolves to whether the current AI agent
 * has Cloudflare skills installed. The promise is started lazily on first
 * call and cached for the lifetime of the process.
 *
 * @returns A promise resolving to the {@link AgentSkillsInstallStatus} for the current agent.
 */
export function telemetryCurrentAgentSkillsInstalled(): Promise<AgentSkillsInstallStatus> {
	_telemetryPromise ??= computeTelemetryCurrentAgentSkillsInstalled();
	return _telemetryPromise;
}

/**
 * Queries rosie for detected agents on the user's machine.
 *
 * @returns Array of detected agents with their display names, rosie IDs, and skills paths.
 */
async function getDetectedAgents(): Promise<AgentInfo[]> {
	const allAgents = await rosieAgents();
	return allAgents
		.filter(
			(
				agent
			): agent is typeof agent & {
				detected: true;
				installPath: string;
			} => agent.detected && agent.installPath !== null
		)
		.map((agent) => ({
			name: agent.display,
			rosie: {
				id: agent.name,
				globalPath: agent.installPath,
			},
		}));
}
