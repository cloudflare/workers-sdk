import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGitBranchName } from "../src/shared/git-branch";

function git(cwd: string, args: string[]) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

describe("resolveGitBranchName", () => {
	let repo: string;
	const previousCwd = process.cwd();

	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), "deploy-helpers-git-branch-"));
		git(repo, ["init", "-b", "fresh-unborn"]);
		git(repo, ["config", "user.email", "test@example.com"]);
		git(repo, ["config", "user.name", "Test"]);
		process.chdir(repo);
	});

	afterEach(() => {
		process.chdir(previousCwd);
		rmSync(repo, { recursive: true, force: true });
	});

	it("returns the branch name for an unborn repository", () => {
		expect(resolveGitBranchName()).toBe("fresh-unborn");
	});

	it("does not leak git stderr when resolving an unborn branch", () => {
		const err = vi.spyOn(process.stderr, "write");
		expect(resolveGitBranchName()).toBe("fresh-unborn");
		const leaked = err.mock.calls
			.map((call) => String(call[0]))
			.join("")
			.includes("fatal:");
		err.mockRestore();
		expect(leaked).toBe(false);
	});

	it("returns undefined for a detached HEAD", () => {
		writeFileSync(join(repo, "file.txt"), "hi\n");
		git(repo, ["add", "file.txt"]);
		git(repo, ["commit", "-m", "init"]);
		const sha = git(repo, ["rev-parse", "HEAD"]);
		git(repo, ["checkout", "--detach", sha]);
		expect(resolveGitBranchName()).toBeUndefined();
	});

	it("returns the branch name after the first commit", () => {
		writeFileSync(join(repo, "file.txt"), "hi\n");
		git(repo, ["add", "file.txt"]);
		git(repo, ["commit", "-m", "init"]);
		expect(resolveGitBranchName()).toBe("fresh-unborn");
	});
});
