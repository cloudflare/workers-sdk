import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

async function getGitStatus(cwd: string): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["status", "--porcelain=v1", "--untracked-files=normal"],
			{
				cwd,
				encoding: "utf8",
				env: { ...process.env, LC_ALL: "C" },
			}
		);
		return stdout;
	} catch (error) {
		if (isOutsideGitWorktree(error)) {
			return undefined;
		}
		throw new Error(
			"Unable to verify that the Git worktree is clean. Rerun with --force to bypass this safety check.",
			{ cause: error }
		);
	}
}

/** Ensures the target is either outside Git or in a clean Git worktree. */
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
			"Git worktree is not clean. Commit or stash your changes before running a codemod, or rerun with --force to bypass this safety check."
		);
	}
}
