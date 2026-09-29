import { execFileSync } from "node:child_process";

/** Returns a local branch name, but never treats a detached HEAD as a branch. */
export function getGitBranchName(): string | undefined {
	try {
		const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
		return branch && branch !== "HEAD" ? branch : undefined;
	} catch {
		return undefined;
	}
}
