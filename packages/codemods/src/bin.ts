#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import { availableCodemods, runCodemod } from "./runner";

/** Prints command usage and the available codemods. */
function printHelp(): void {
	console.log(`Usage: cloudflare-codemods <codemod> [options]

Run a codemod by name:
  npx @cloudflare/codemods vitest:v3-to-v4

Options:
  --cwd <path>     Project directory (default: current directory)
  --files <glob>   Restrict files considered; may be repeated
  --dry-run        List changes without writing files
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
			cwd: { type: "string" },
			files: { type: "string", multiple: true },
			"dry-run": { type: "boolean", default: false },
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
	const cwd = path.resolve(values.cwd ?? process.cwd());
	const result = await runCodemod(name, {
		cwd,
		dryRun: values["dry-run"],
		files: values.files,
	});

	if (result.changedFiles.length > 0) {
		console.log(`${name}: ${result.changedFiles.length} file(s)`);
		for (const changedFile of result.changedFiles) {
			console.log(`  ${changedFile}`);
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
