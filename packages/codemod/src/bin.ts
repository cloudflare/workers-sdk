#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import { codemods, getCategories, runCodemods } from "./runner";

function printHelp(): void {
	console.log(`Usage: cloudflare-codemod <category> [codemod] [options]

Run all relevant codemods in a category:
  npx @cloudflare/codemod vitest

Run one codemod:
  npx @cloudflare/codemod vitest vitest-v3-to-v4

Options:
  --cwd <path>     Project directory (default: current directory)
  --files <glob>   Restrict files considered; may be repeated
  --dry-run        List changes without writing files
  --help           Show this help

Categories:
${getCategories()
	.map((category) => `  ${category}`)
	.join("\n")}

Codemods:
${codemods.map((codemod) => `  ${codemod.category} ${codemod.name}\n      ${codemod.description}`).join("\n")}`);
}

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
	if (positionals.length > 2) {
		throw new Error("Expected a category and optionally one codemod name");
	}

	const category = positionals[0];
	if (!category) {
		throw new Error("Expected a codemod category");
	}
	const cwd = path.resolve(values.cwd ?? process.cwd());
	const results = await runCodemods(category, positionals[1], {
		cwd,
		dryRun: values["dry-run"],
		files: values.files,
	});
	const changedFiles = new Set(
		results.flatMap(({ result }) => result.changedFiles)
	);

	for (const { codemod, result } of results) {
		if (result.changedFiles.length > 0) {
			console.log(`${codemod.name}: ${result.changedFiles.length} file(s)`);
		}
	}
	console.log(
		changedFiles.size === 0
			? "Project is already up to date."
			: `${values["dry-run"] ? "Would update" : "Updated"} ${changedFiles.size} file(s). Run your package manager's install command to refresh its lockfile.`
	);
}

await main();
