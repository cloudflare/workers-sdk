#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import { formatFollowUps } from "./cli-output";
import { availableCodemods, runCodemod } from "./runner";

/** Prints command usage and the available codemods. */
function printHelp(): void {
	console.log(`Usage: cloudflare-codemods <codemod> [options]

Run a codemod by name:
  npx @cloudflare/codemods vitest:v3-to-v4

Options:
  --cwd <path>     Project directory (default: current directory)
  --config <path>  Exact Wrangler config path (wrangler-to-cf only)
  --bundler <name> Bundler to migrate to: vite or wrangler (default: vite)
  --files <glob>   Restrict files considered; may be repeated
  --dry-run        List changes without writing files
  --force          Run even if the Git worktree is not clean
  --help           Show this help

Available Codemods:
${availableCodemods.map((codemod) => `  ${codemod.name}\n      ${codemod.description}`).join("\n")}`);
}

/**
 * Runs the codemod CLI.
 *
 * @param args Command-line arguments excluding the executable and script paths.
 */
export async function main(args = process.argv.slice(2)): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			bundler: { type: "string" },
			config: { type: "string" },
			cwd: { type: "string" },
			files: { type: "string", multiple: true },
			"dry-run": { type: "boolean", default: false },
			force: { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});

	if (values.help || positionals.length === 0) {
		printHelp();
		return;
	}
	if (positionals.length > 1) {
		throw new Error("Expected a single codemod name");
	}

	const name = positionals[0];
	if (!name) {
		throw new Error("Expected a codemod name");
	}
	if (
		values.bundler !== undefined &&
		values.bundler !== "vite" &&
		values.bundler !== "wrangler"
	) {
		throw new Error("Expected --bundler to be either vite or wrangler");
	}
	const cwd = path.resolve(values.cwd ?? process.cwd());
	const result = await runCodemod(name, {
		bundler: values.bundler,
		configPath: values.config,
		cwd,
		dryRun: values["dry-run"],
		files: values.files,
		force: values.force,
	});

	if (result.changedFiles.length > 0) {
		console.log(`${name}: ${result.changedFiles.length} file(s)`);
		for (const changedFile of result.changedFiles) {
			console.log(`  ${changedFile}`);
		}
	}
	const followUpLines = formatFollowUps(result.followUps ?? []);
	if (followUpLines.length > 0) {
		console.log("");
		for (const line of followUpLines) {
			console.log(line);
		}
	}
	console.log(
		result.changedFiles.length === 0
			? "Project is already up to date."
			: values["dry-run"]
				? `Would update ${result.changedFiles.length} file(s).`
				: `Updated ${result.changedFiles.length} file(s). Run your package manager's install command to refresh its lockfile.`
	);
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
