import { execSync } from "node:child_process";

/**
 * execSync is typed as string when encoding is set, but Wrangler stubs
 * return a Buffer. Read either shape as text before trim.
 */
export function gitCommandText(stdout: unknown): string {
	if (typeof stdout === "string") {
		return stdout;
	}
	if (stdout instanceof Uint8Array) {
		return new TextDecoder().decode(stdout);
	}
	return "";
}

/**
 * Resolve the current Git branch name for the working tree.
 *
 * Uses `git branch --show-current` so unborn branches (fresh
 * `git init -b <name>` with no commits) still report their branch.
 * Detached checkouts return an empty name, so this returns undefined
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
		const branch = gitCommandText(
			execSync(`git branch --show-current`, {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			})
		).trim();
		return branch || undefined;
	} catch {
		return undefined;
	}
}
