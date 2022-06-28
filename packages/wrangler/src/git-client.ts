import { execa } from "execa";
import { findUp } from "find-up";

/**
 * Check whether the given current working directory is within a git repository
 * by looking for a `.git` directory in this or an ancestor directory.
 */
export async function isInsideGitRepo(cwd: string) {
	const res = await findUp(".git", { cwd, type: "directory" });
	return res !== undefined;
}

/**
 * Check whether git is installed by trying to run it.
 */
export async function isGitInstalled() {
	try {
		return (await execa("git", ["--version"])).exitCode === 0;
	} catch (err) {
		return false;
	}
}

/**
 * Initialize a new Worker project with a git repository.
 *
 * We want the branch to be called `main` but earlier versions of git do not support `--initial-branch`.
 * If that is the case then we just fallback to the default initial branch name.
 */
export async function initializeGit(cwd: string) {
	try {
		// Try to create the repository with the HEAD branch of `main`.
		await execa("git", ["init", "--initial-branch", "main"], {
			cwd,
		});
	} catch {
		// Unable to create the repo with a HEAD branch name, so just fall back to the default.
		await execa("git", ["init"], {
			cwd,
		});
	}
}
