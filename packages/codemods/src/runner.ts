import { readFile, writeFile } from "node:fs/promises";
import { vitestCodemods } from "./codemods/vitest";
import type { Codemod, CodemodContext, CodemodResult } from "./types";

export const codemods: Codemod[] = [...vitestCodemods];

function normaliseName(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-");
}

export function getCategories(): string[] {
	return [...new Set(codemods.map((codemod) => codemod.category))];
}

export function getCategoryCodemods(category: string): Codemod[] {
	return codemods.filter(
		(codemod) => normaliseName(codemod.category) === normaliseName(category)
	);
}

export async function runCodemods(
	category: string,
	name: string | undefined,
	context: CodemodContext
): Promise<Array<{ codemod: Codemod; result: CodemodResult }>> {
	const categoryCodemods = getCategoryCodemods(category);
	if (categoryCodemods.length === 0) {
		throw new Error(`Unknown codemod category: ${category}`);
	}

	const selected = name
		? categoryCodemods.filter((codemod) =>
				[codemod.name, ...(codemod.aliases ?? [])].some(
					(candidate) => normaliseName(candidate) === normaliseName(name)
				)
			)
		: categoryCodemods;
	if (selected.length === 0) {
		throw new Error(`Unknown ${category} codemod: ${name}`);
	}

	const stagedFiles = new Map<string, string>();
	const results = [];
	for (const codemod of selected) {
		results.push({
			codemod,
			result: await codemod.run({ ...context, stagedFiles }),
		});
	}
	if (!context.dryRun) {
		await Promise.all(
			[...stagedFiles].map(async ([filePath, output]) => {
				if ((await readFile(filePath, "utf8")) !== output) {
					await writeFile(filePath, output);
				}
			})
		);
	}
	return results;
}
