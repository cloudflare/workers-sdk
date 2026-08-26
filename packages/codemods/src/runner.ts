import { readFile, writeFile } from "node:fs/promises";
import { vitestCodemods } from "./codemods/vitest";
import type { Codemod, CodemodContext, CodemodResult } from "./types";

export const availableCodemods: Codemod[] = [...vitestCodemods];

/** Returns a canonical form used to compare codemod names and aliases. */
function normaliseName(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-");
}

/** Returns the codemod matching a name or human-readable alias. */
export function getCodemod(name: string): Codemod | undefined {
	return availableCodemods.find((codemod) =>
		[codemod.name, ...(codemod.aliases ?? [])].some(
			(candidate) => normaliseName(candidate) === normaliseName(name)
		)
	);
}

/**
 * Runs a named codemod and writes its staged outputs unless this is a dry run.
 *
 * @param name Codemod name or alias.
 * @param context Working directory, dry-run mode, and optional file restrictions.
 * @returns The files changed by the codemod.
 */
export async function runCodemod(
	name: string,
	context: CodemodContext
): Promise<CodemodResult> {
	const codemod = getCodemod(name);
	if (!codemod) {
		throw new Error(`Unknown codemod: ${name}`);
	}

	const stagedFiles = new Map<string, string>();
	const result = await codemod.run({ ...context, stagedFiles });
	if (!context.dryRun) {
		await Promise.all(
			[...stagedFiles].map(async ([filePath, output]) => {
				if ((await readFile(filePath, "utf8")) !== output) {
					await writeFile(filePath, output);
				}
			})
		);
	}
	return result;
}
