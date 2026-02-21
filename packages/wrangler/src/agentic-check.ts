/**
 * Lightweight agentic environment detection
 *
 * Detects when Wrangler is running in an AI-assisted coding environment
 * (Cursor, Claude Code, Copilot, Windsurf, etc.) using environment variables.
 *
 * This is a lightweight implementation that doesn't require external dependencies
 * or process ancestry checks, keeping CLI startup fast.
 *
 * Based on detection patterns from https://github.com/ascorbic/am-i-vibing
 */

export interface AgenticEnvironment {
	/** Whether an agentic environment was detected */
	isAgentic: boolean;
	/** Human-readable name of the detected environment, or null if not detected */
	name: string | null;
}

interface EnvCheck {
	/** Human-readable name of the environment */
	name: string;
	/**
	 * Environment variable checks.
	 * - string: check if env var exists
	 * - [string, string]: check if env var equals specific value
	 */
	checks: (string | [string, string])[];
	/**
	 * If true, ALL checks must pass.
	 * If false/undefined, ANY check passing is sufficient.
	 */
	requireAll?: boolean;
}

/**
 * List of agentic environments to detect.
 * Order matters - more specific checks (requireAll) should come before
 * less specific ones to avoid false positives.
 */
const AGENTIC_ENVIRONMENTS: EnvCheck[] = [
	// Claude Code
	{ name: "Claude Code", checks: ["CLAUDECODE"] },
	// OpenCode (SST)
	{
		name: "OpenCode",
		checks: [
			"OPENCODE_BIN_PATH",
			"OPENCODE_SERVER",
			"OPENCODE_APP_INFO",
			"OPENCODE_MODES",
		],
	},
	// Cursor Agent mode - has both CURSOR_TRACE_ID and specific PAGER setting
	{
		name: "Cursor Agent",
		checks: ["CURSOR_TRACE_ID", ["PAGER", "head -n 10000 | cat"]],
		requireAll: true,
	},
	// Cursor interactive - just CURSOR_TRACE_ID (must come after Agent check)
	{ name: "Cursor", checks: ["CURSOR_TRACE_ID"] },
	// Windsurf (Codeium)
	{ name: "Windsurf", checks: ["CODEIUM_EDITOR_APP_ROOT"] },
	// VS Code Copilot Agent - requires both TERM_PROGRAM=vscode and GIT_PAGER=cat
	{
		name: "GitHub Copilot",
		checks: [
			["TERM_PROGRAM", "vscode"],
			["GIT_PAGER", "cat"],
		],
		requireAll: true,
	},
	// Zed Agent - requires both TERM_PROGRAM=zed and PAGER=cat
	{
		name: "Zed Agent",
		checks: [
			["TERM_PROGRAM", "zed"],
			["PAGER", "cat"],
		],
		requireAll: true,
	},
	// Zed interactive (must come after Agent check)
	{ name: "Zed", checks: [["TERM_PROGRAM", "zed"]] },
	// Replit Assistant mode
	{
		name: "Replit Assistant",
		checks: ["REPL_ID", ["REPLIT_MODE", "assistant"]],
		requireAll: true,
	},
	// Replit interactive (must come after Assistant check)
	{ name: "Replit", checks: ["REPL_ID"] },
	// Bolt.new Agent mode
	{
		name: "Bolt.new",
		checks: [["SHELL", "/bin/jsh"], "npm_config_yes"],
		requireAll: true,
	},
	// Warp Terminal (hybrid - both agentic and interactive)
	{ name: "Warp Terminal", checks: [["TERM_PROGRAM", "WarpTerminal"]] },
	// Jules
	{
		name: "Jules",
		checks: [
			["HOME", "/home/jules"],
			["USER", "swebot"],
		],
		requireAll: true,
	},
	// Aider
	{ name: "Aider", checks: ["AIDER_API_KEY"] },
];

/**
 * Check if a single environment variable condition is met.
 */
function checkEnvVar(
	check: string | [string, string],
	env: Record<string, string | undefined>
): boolean {
	if (typeof check === "string") {
		// Just check if the env var exists and is non-empty
		return env[check] !== undefined && env[check] !== "";
	}
	// Check if env var equals a specific value
	const [key, expectedValue] = check;
	return env[key] === expectedValue;
}

/**
 * Detect if the current environment is an agentic coding environment.
 *
 * @param env - Environment variables to check (defaults to process.env)
 * @returns Detection result with isAgentic flag and environment name
 */
export function detectAgenticEnvironment(
	env: Record<string, string | undefined> = process.env
): AgenticEnvironment {
	for (const envCheck of AGENTIC_ENVIRONMENTS) {
		const results = envCheck.checks.map((check) => checkEnvVar(check, env));

		const matches = envCheck.requireAll
			? results.every(Boolean)
			: results.some(Boolean);

		if (matches) {
			return { isAgentic: true, name: envCheck.name };
		}
	}

	return { isAgentic: false, name: null };
}
