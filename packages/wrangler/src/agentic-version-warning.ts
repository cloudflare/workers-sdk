/**
 * Agentic Version Warning
 *
 * Shows a prominent warning when Wrangler is running in an AI-assisted coding
 * environment and the installed version is significantly outdated (major version behind).
 *
 * This helps catch cases where LLMs mistakenly install old versions of Wrangler.
 * The warning is shown once per project and gives the user/agent the option to
 * abort and update before proceeding.
 */

import chalk from "chalk";
import { version as wranglerVersion } from "../package.json";
import { detectAgenticEnvironment } from "./agentic-check";
import { getConfigCache, saveToConfigCache } from "./config-cache";
import { confirm } from "./dialogs";
import { CI } from "./is-ci";
import isInteractive from "./is-interactive";
import { logger } from "./logger";
import { sniffUserAgent } from "./package-manager";
import { updateCheck } from "./update-check";

const AGENTIC_CACHE_FILENAME = "wrangler-agentic.json";

interface AgenticCacheFile {
	/** The major version we last warned about - prevents repeat warnings */
	warningShownForMajor?: number;
}

/**
 * Get the appropriate install command for the detected package manager.
 */
function getInstallCommand(): string {
	const pm = sniffUserAgent();
	switch (pm) {
		case "pnpm":
			return "pnpm add wrangler@latest";
		case "yarn":
			return "yarn add wrangler@latest";
		case "bun":
			return "bun add wrangler@latest";
		case "npm":
		default:
			return "npm install wrangler@latest";
	}
}

/**
 * Check if we should show the agentic version warning and handle the abort flow.
 *
 * This function:
 * 1. Skips entirely in CI environments (to avoid breaking builds)
 * 2. Detects if we're in an agentic environment
 * 3. Checks if the current version is a major version behind latest
 * 4. Shows a one-time warning per project if conditions are met
 * 5. In interactive mode: prompts user to continue or abort
 * 6. In non-interactive mode: exits to let the agent decide what to do
 *
 * @returns true if command should continue, false if user chose to abort
 */
export async function checkAgenticVersionWarning(): Promise<boolean> {
	// 1. Skip in CI environments - we don't want to break builds or have
	// build agents trying to update locked dependencies
	if (CI.isCI()) {
		return true;
	}

	// 2. Detect if we're in an agentic environment
	const agenticResult = detectAgenticEnvironment();
	if (!agenticResult.isAgentic) {
		return true; // Not in an agentic environment, continue normally
	}

	// 2. Get latest version from npm
	const latestVersion = await updateCheck();
	if (!latestVersion) {
		return true; // Can't determine latest version, continue
	}

	// 3. Check if we're a major version behind
	const currentMajor = parseInt(wranglerVersion.split(".")[0]);
	const latestMajor = parseInt(latestVersion.split(".")[0]);

	if (latestMajor <= currentMajor) {
		return true; // Not a major version behind, continue
	}

	// 4. Check if we've already shown the warning for this major version gap
	const cache = getConfigCache<AgenticCacheFile>(AGENTIC_CACHE_FILENAME);
	if (cache.warningShownForMajor === latestMajor) {
		return true; // Already shown warning for this gap, continue
	}

	// 5. Get the appropriate install command for this package manager
	const installCommand = getInstallCommand();

	// 6. Mark warning as shown so we don't repeat it
	saveToConfigCache<AgenticCacheFile>(AGENTIC_CACHE_FILENAME, {
		warningShownForMajor: latestMajor,
	});

	// 7. Handle abort flow based on interactivity
	if (isInteractive()) {
		// Interactive: show a human-friendly warning box
		logger.warn(
			chalk.yellow(`
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ⚠️  OUTDATED WRANGLER VERSION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  You are running Wrangler v${currentMajor}, but v${latestMajor} is now available.                          │
│                                                                             │
│  This appears to be an AI-assisted coding session (${agenticResult.name}).
│  LLMs sometimes install outdated package versions by mistake.               │
│                                                                             │
│  To update, run:                                                            │
│                                                                             │
│    ${installCommand}
│                                                                             │
│  Or ask your AI assistant to update Wrangler to the latest version.         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
`)
		);

		const shouldContinue = await confirm(
			"Do you want to continue with the current version?",
			{ defaultValue: false, fallbackValue: true }
		);
		return shouldContinue;
	} else {
		// Non-interactive (most agentic environments): show LLM-friendly structured output
		// Using XML-style format that's easy for LLMs to parse and act on
		logger.error(`
<wrangler_version_error>
  <current_version>${wranglerVersion}</current_version>
  <latest_version>${latestVersion}</latest_version>
  <current_major>${currentMajor}</current_major>
  <latest_major>${latestMajor}</latest_major>
  <detected_environment>${agenticResult.name}</detected_environment>
  <update_command>${installCommand}</update_command>
  <message>
    You are using an outdated major version of Wrangler (v${currentMajor} instead of v${latestMajor}).
    This command has been aborted because major version updates often contain breaking changes and new features.
    Please update Wrangler before continuing.
  </message>
  <action_required>
    Run the following command to update Wrangler, then retry your original command:
    ${installCommand}
  </action_required>
</wrangler_version_error>
`);
		return false;
	}
}
