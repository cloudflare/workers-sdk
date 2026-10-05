import { execSync } from "node:child_process";

/**
 * Resolve the current Git branch name for the working tree.
 *
 * Uses `git symbolic-ref --short HEAD` so unborn branches (fresh
 * `git init -b <name>` with no commits) still report their branch.
 * Detached checkouts have no symbolic ref, so this returns undefined
 * rather than the literal "HEAD" that `rev-parse --abbrev-ref` prints.
 * Subprocess stderr is swallowed so Git's fatal messages never leak.
 */
export function resolveGitBranchName(): string | undefined {
	try {
		execSync(`git rev-parse --is-inside-work-tree`, {
			stdio: ["ignore", "ignore", "ignore"],
		});
	} catch {
		return undefined;
	}

	try {
		const branch = execSync(`git symbolic-ref --short HEAD`, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return branch || undefined;
	} catch {
		// Detached HEAD, or Git could not resolve a branch name.
		return undefined;
	}
}
