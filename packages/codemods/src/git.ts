import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Checks whether a failed Git command indicates that its working directory is
 * outside a Git worktree.
 *
 * @param error The value thrown by the Git command.
 *
 * @returns Whether Git reported that the working directory is not in a repository.
 */
function isOutsideGitWorktree(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		error.code === 128 &&
		"stderr" in error &&
		typeof error.stderr === "string" &&
		error.stderr.includes("not a git repository")
	);
}

/**
 * Checks whether a Git command failed because the executable was unavailable.
 *
 * @param error The value thrown by the Git command.
 *
 * @returns Whether the Git executable could not be found.
 */
function isGitUnavailable(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Checks for Git metadata in a directory or one of its ancestors without
 * invoking Git. Filesystem errors are treated as possible metadata so the
 * safety check fails closed.
 *
 * @param cwd The directory from which to start searching.
 *
 * @returns Whether the directory may belong to a Git worktree.
 */
async function hasGitMetadata(cwd: string): Promise<boolean> {
	let currentDirectory: string;
	try {
		currentDirectory = await realpath(cwd);
	} catch {
		return true;
	}

	while (true) {
		try {
			await lstat(path.join(currentDirectory, ".git"));
			return true;
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			) {
				return true;
			}
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return false;
		}

		currentDirectory = parentDirectory;
	}
}

/**
 * Reads the tracked and untracked changes in a Git worktree.
 *
 * @param cwd The directory in which to run Git.
 *
 * @returns The porcelain status output, or `undefined` when the directory is outside a Git worktree.
 *
 * @throws When Git status cannot be determined for any other reason.
 */
async function getGitStatus(cwd: string): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["status", "--porcelain=v1", "--untracked-files=normal"],
			{
				cwd,
				encoding: "utf8",
				env: {
					...process.env,
					LC_ALL: "C",
				},
			}
		);
		return stdout;
	} catch (error) {
		if (isOutsideGitWorktree(error)) {
			return undefined;
		}
		if (isGitUnavailable(error) && !(await hasGitMetadata(cwd))) {
			return undefined;
		}
		throw new Error(
			"Unable to verify that the Git worktree is clean. Rerun with --force to bypass this safety check.",
			{ cause: error }
		);
	}
}

/**
 * Ensures that a codemod target is either outside Git or in a clean Git
 * worktree. The check is skipped when the safety override is enabled.
 *
 * @param cwd The target directory to check.
 * @param force Whether to bypass the Git worktree safety check.
 *
 * @returns A promise that resolves when the target is safe to modify.
 *
 * @throws When the worktree has changes or its Git status cannot be determined.
 */
export async function ensureCleanGitWorktree(
	cwd: string,
	force: boolean
): Promise<void> {
	if (force) {
		return;
	}

	const status = await getGitStatus(cwd);
	if (status && status.length > 0) {
		throw new Error(
			"Git worktree is not clean. Commit or stash your changes before running a codemod, or rerun with `--force` to bypass this safety check."
		);
	}
}
