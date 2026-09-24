import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { glob, type GlobOptions } from "tinyglobby";
import type { CodemodContext, RunContext } from "./types";

const DEFAULT_IGNORES = [
	"**/.git/**",
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/.wrangler/**",
	"**/package-lock.json",
	"**/npm-shrinkwrap.json",
];

function getGlobOptions(cwd: string): GlobOptions {
	return {
		cwd,
		absolute: true,
		dot: true,
		ignore: DEFAULT_IGNORES,
	} as const;
}

function normalizeFilePath(cwd: string, filePath: string): string {
	return path.resolve(cwd, filePath).split(path.sep).join(path.posix.sep);
}

/**
 * Checks whether a filesystem path exists without suppressing other errors.
 *
 * @param filePath Path to check.
 *
 * @returns Whether the path exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

/**
 * Filters absolute or working-directory-relative paths using a codemod's file
 * restrictions.
 *
 * @param context Working directory and optional file restriction globs.
 * @param filePaths Candidate file paths.
 *
 * @returns Candidate paths included by the restrictions.
 */
export async function filterByFileRestrictions(
	context: Pick<CodemodContext, "cwd" | "files">,
	filePaths: readonly string[]
): Promise<string[]> {
	if (!context.files) {
		return [...filePaths];
	}

	const restrictedPaths = new Set(
		(await glob(context.files, getGlobOptions(context.cwd))).map((filePath) =>
			normalizeFilePath(context.cwd, filePath)
		)
	);

	return filePaths.filter((filePath) =>
		restrictedPaths.has(normalizeFilePath(context.cwd, filePath))
	);
}

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
	const globOptions = getGlobOptions(context.cwd);
	const filePaths = await glob(patterns, globOptions);
	const filteredFilePaths = await filterByFileRestrictions(context, filePaths);
	const changes: Array<{ filePath: string; output: string }> = [];

	for (const filePath of filteredFilePaths.sort()) {
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
