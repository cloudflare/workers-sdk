import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	getGlobalWranglerConfigPath,
	parseJSONC,
} from "@cloudflare/workers-utils";
import ci from "ci-info";
import { confirm } from "./dialogs";
import isInteractive from "./is-interactive";
import { logger } from "./logger";
import { sendMetricsEvent } from "./metrics";

/**
 * Detects AI coding agents installed on the user's machine and, if
 * appropriate, offers to install Cloudflare skill files into their global
 * skills directories.
 *
 * Skills are installed via the rosie-skills JS API, which handles
 * downloading from the `cloudflare/skills` GitHub repository, agent
 * detection, and file placement.
 *
 * @param force - When `true` the interactive prompt is skipped and skills are
 *   installed unconditionally (used by `--install-skills`).
 */
export async function maybeInstallCloudflareSkillsGlobally(
	force: boolean
): Promise<void> {
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
				},
				{}
			);
		} else {
			sendMetricsEvent(
				"skills_install_completed",
				{
					agents: result.targetedAgents,
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

	// In non-interactive terminals (but not CI), log a message
	if (!force && !isInteractive()) {
		logger.log(
			`Cloudflare agent skills are available for: ${detectedAgents.map(({ name }) => name).join(", ")}. Run wrangler in an interactive terminal to install them, or use \`--install-skills\` to install without prompting.`
		);
		sendResultMetricsEvent({
			skippedBecause: "Non-interactive terminal",
		});
		return;
	}

	const accepted =
		force ||
		(await confirm(
			`Wrangler detected the following AI coding agents: ${detectedAgents.map(({ name }) => name).join(", ")}. Would you like to install Cloudflare skills for them?`,
			{ defaultValue: true, fallbackValue: false }
		));

	if (!accepted) {
		writeSkillsInstallMetadataFile({
			accepted: false,
			date: new Date().toISOString(),
			detectedAgents,
		});
		sendResultMetricsEvent({ skippedBecause: "User declined" });
		return;
	}

	try {
		const rosie = await import("rosie-skills");
		const agentNames = detectedAgents.map((a) => a.rosieId);
		const { failedAgents } = await rosie.install(SKILLS_REPO, {
			global: true,
			agent: agentNames,
			lockfile: false,
		});

		const failedSet = new Set(failedAgents);
		const succeededAgents = detectedAgents.filter(
			(a) => !failedSet.has(a.rosieId)
		);

		if (succeededAgents.length > 0) {
			logger.log(
				`Successfully installed Cloudflare skills for: ${succeededAgents.map(({ name }) => name).join(", ")}.`
			);
		}

		if (failedAgents.length > 0) {
			logger.warn(
				`Skills installation failed for agents: ${failedAgents.join(", ")}.`
			);
			logger.warn(SKILLS_INSTALL_RETRY_HINT);
		}

		writeSkillsInstallMetadataFile({
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
	/** Rosie's short identifier for the agent (e.g. "claude"). */
	rosieId: string;
	/** Absolute path to the agent's global skills directory. */
	globalSkillsPath: string;
};

/**
 * Persisted configuration that tracks whether the user has been prompted
 * about installing Cloudflare agent skills globally.
 */
interface SkillsInstallMetadata {
	/** Whether the user accepted the prompt to install skills. */
	accepted: boolean;
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
 */
function writeSkillsInstallMetadataFile(metadata: SkillsInstallMetadata): void {
	const configPath = getSkillsInstallMetadataFilePath();
	mkdirSync(path.dirname(configPath), { recursive: true });
	writeFileSync(configPath, JSON.stringify(metadata, null, "\t"));
}

/**
 * Queries rosie for detected agents on the user's machine.
 *
 * @returns Array of detected agents with their display names, rosie IDs, and skills paths.
 */
async function getDetectedAgents(): Promise<AgentInfo[]> {
	const rosie = await import("rosie-skills");
	const allAgents = await rosie.agents();
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
			rosieId: agent.name,
			globalSkillsPath: agent.installPath,
		}));
}
