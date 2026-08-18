import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import type { RunContext } from "./types";

const DEFAULT_IGNORES = [
	"**/.git/**",
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/.wrangler/**",
	"**/package-lock.json",
	"**/npm-shrinkwrap.json",
];

/**
 * Applies a transform to matching files and stages changed outputs in memory.
 *
 * @param context Shared state and file restrictions for the codemod run.
 * @param patterns Glob patterns defining the codemod's file scope.
 * @param transform Function that transforms one file's source.
 * @returns Paths changed by the transform, relative to the working directory.
 */
export async function transformFiles(
	context: RunContext,
	patterns: string[],
	transform: (source: string, filePath: string) => string
): Promise<string[]> {
	const globOptions = {
		cwd: context.cwd,
		absolute: true,
		dot: true,
		ignore: DEFAULT_IGNORES,
	} as const;
	const filePaths = await glob(patterns, globOptions);
	const restrictedPaths = context.files
		? new Set(await glob(context.files, globOptions))
		: undefined;
	const changes: Array<{ filePath: string; output: string }> = [];

	for (const filePath of filePaths
		.filter((candidate) => !restrictedPaths || restrictedPaths.has(candidate))
		.sort()) {
		const source =
			context.stagedFiles.get(filePath) ?? (await readFile(filePath, "utf8"));
		const output = transform(source, filePath);
		if (output === source) {
			continue;
		}

		changes.push({ filePath, output });
	}

	for (const { filePath, output } of changes) {
		context.stagedFiles.set(filePath, output);
	}

	return changes.map(({ filePath }) => path.relative(context.cwd, filePath));
}
