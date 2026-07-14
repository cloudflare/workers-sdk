import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import type { CodemodContext } from "./types";

const DEFAULT_IGNORES = [
	"**/.git/**",
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/.wrangler/**",
	"**/package-lock.json",
	"**/npm-shrinkwrap.json",
];

export async function transformFiles(
	context: CodemodContext,
	patterns: string[],
	transform: (source: string, filePath: string) => string
): Promise<string[]> {
	const filePaths = await glob(context.files ?? patterns, {
		cwd: context.cwd,
		absolute: true,
		dot: true,
		ignore: DEFAULT_IGNORES,
	});
	const changes: Array<{ filePath: string; output: string }> = [];

	for (const filePath of filePaths.sort()) {
		const source = await readFile(filePath, "utf8");
		const output = transform(source, filePath);
		if (output === source) {
			continue;
		}

		changes.push({ filePath, output });
	}

	if (!context.dryRun) {
		await Promise.all(
			changes.map(({ filePath, output }) => writeFile(filePath, output))
		);
	}

	return changes.map(({ filePath }) => path.relative(context.cwd, filePath));
}
