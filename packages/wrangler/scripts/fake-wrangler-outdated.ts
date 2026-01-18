#!/usr/bin/env node
/**
 * Fake wrangler that simulates being an outdated version.
 *
 * This outputs the exact same warning that real wrangler would show
 * when running in an agentic environment with an outdated major version.
 *
 * Use this to test how AI agents respond to the version warning.
 */

const currentVersion = "3.99.0";
const latestVersion = "5.0.0";
const currentMajor = 3;
const latestMajor = 5;
const detectedEnvironment = process.env.CLAUDECODE
	? "Claude Code"
	: process.env.CURSOR_TRACE_ID
		? "Cursor"
		: process.env.CODEIUM_EDITOR_APP_ROOT
			? "Windsurf"
			: process.env.OPENCODE_SERVER
				? "OpenCode"
				: "AI Assistant";

// Detect package manager
const userAgent = process.env.npm_config_user_agent || "";
let installCommand = "npm install wrangler@latest";
if (userAgent.includes("pnpm")) {
	installCommand = "pnpm add wrangler@latest";
} else if (userAgent.includes("yarn")) {
	installCommand = "yarn add wrangler@latest";
} else if (userAgent.includes("bun")) {
	installCommand = "bun add wrangler@latest";
}

// Print the banner first (like real wrangler)
console.log(`
 ⛅️ wrangler ${currentVersion} (update available 5.0.0)
───────────────────────────────────────────────`);

// Print the LLM-friendly error (non-interactive mode)
console.error(`
<wrangler_version_error>
  <current_version>${currentVersion}</current_version>
  <latest_version>${latestVersion}</latest_version>
  <current_major>${currentMajor}</current_major>
  <latest_major>${latestMajor}</latest_major>
  <detected_environment>${detectedEnvironment}</detected_environment>
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

process.exit(1);
