#!/usr/bin/env npx tsx
/**
 * Test script to simulate the agentic version warning.
 *
 * This script sets up environment variables to simulate an agentic environment
 * and a fake "v5.0.0" as the latest version, then runs a wrangler command.
 *
 * Usage:
 *   npx tsx scripts/test-agentic-warning.ts [--env <environment>] [command...]
 *
 * Options:
 *   --env <name>   Simulate a specific environment (claude, cursor, cursor-agent, copilot, windsurf, opencode, zed)
 *
 * Examples:
 *   npx tsx scripts/test-agentic-warning.ts
 *   npx tsx scripts/test-agentic-warning.ts --env cursor
 *   npx tsx scripts/test-agentic-warning.ts --env copilot
 *   npx tsx scripts/test-agentic-warning.ts dev
 *   npx tsx scripts/test-agentic-warning.ts --env opencode deploy --dry-run
 */
import { spawn } from "node:child_process";
// Clear the agentic warning cache so it shows every time
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findUpSync } from "find-up";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wranglerRoot = join(__dirname, "..");

// Parse arguments
const args = process.argv.slice(2);
let envName = "claude";
const wranglerArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--env" && args[i + 1]) {
		envName = args[i + 1];
		i++; // skip next arg
	} else {
		wranglerArgs.push(args[i]);
	}
}

// Default to --help if no command specified
if (wranglerArgs.length === 0) {
	wranglerArgs.push("--help");
}

const nodeModules = findUpSync("node_modules", { type: "directory" });
if (nodeModules) {
	const cachePath = join(nodeModules, ".cache/wrangler/wrangler-agentic.json");
	try {
		rmSync(cachePath);
		console.log(`Cleared cache: ${cachePath}`);
	} catch {
		// Cache doesn't exist, that's fine
	}
}

// Build environment variables based on chosen environment
const envVars: Record<string, string> = {
	...process.env,
	// Force the update check to return v5.0.0 as the latest version
	__WRANGLER_TEST_FAKE_LATEST_VERSION__: "5.0.0",
} as Record<string, string>;

switch (envName) {
	case "claude":
		envVars.CLAUDECODE = "1";
		break;
	case "cursor":
		envVars.CURSOR_TRACE_ID = "test-trace-id";
		break;
	case "cursor-agent":
		envVars.CURSOR_TRACE_ID = "test-trace-id";
		envVars.PAGER = "head -n 10000 | cat";
		break;
	case "copilot":
		envVars.TERM_PROGRAM = "vscode";
		envVars.GIT_PAGER = "cat";
		break;
	case "windsurf":
		envVars.CODEIUM_EDITOR_APP_ROOT = "/fake/path";
		break;
	case "opencode":
		envVars.OPENCODE_SERVER = "http://localhost:3000";
		break;
	case "zed":
		envVars.TERM_PROGRAM = "zed";
		envVars.PAGER = "cat";
		break;
	case "replit":
		envVars.REPL_ID = "test-repl-id";
		break;
	case "none":
		// No agentic environment - for comparison
		break;
	default:
		console.error(`Unknown environment: ${envName}`);
		console.error(
			"Valid options: claude, cursor, cursor-agent, copilot, windsurf, opencode, zed, replit, none"
		);
		process.exit(1);
}

console.log("=".repeat(70));
console.log("AGENTIC VERSION WARNING TEST");
console.log("=".repeat(70));
console.log(`Simulating environment: ${envName}`);
console.log(`Fake latest version: 5.0.0 (current is 4.x)`);
console.log(`Command: wrangler ${wranglerArgs.join(" ")}`);
console.log("=".repeat(70));
console.log("");

// Run wrangler with the modified environment
const child = spawn(
	"node",
	[join(wranglerRoot, "bin/wrangler.js"), ...wranglerArgs],
	{
		env: envVars,
		stdio: "inherit",
		cwd: wranglerRoot,
	}
);

child.on("exit", (code) => {
	console.log("");
	console.log("=".repeat(70));
	console.log(`Wrangler exited with code: ${code}`);
	if (code !== 0 && envName !== "none") {
		console.log(
			"(Non-zero exit is expected - the agentic warning aborts the command)"
		);
	}
	console.log("=".repeat(70));
	process.exit(code ?? 0);
});
