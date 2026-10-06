import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	getHeadCommitMessage,
	getHeadCommitRef,
	getRepositoryUrl,
} from "../src/preview/shared";

const REPOSITORY_ENV_KEYS = [
	"CI_PROJECT_URL",
	"CI_REPOSITORY_URL",
	"CIRCLE_REPOSITORY_URL",
	"BUILDKITE_REPO",
	"BITBUCKET_GIT_HTTP_ORIGIN",
	"BITBUCKET_GIT_SSH_ORIGIN",
	"REPOSITORY_URL",
	"GITHUB_REPOSITORY",
	"GITHUB_SERVER_URL",
] as const;

function git(cwd: string, args: string[]) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function clearRepositoryEnv() {
	for (const key of REPOSITORY_ENV_KEYS) {
		vi.stubEnv(key, "");
	}
}

describe("preview git metadata on an unborn repository", () => {
	let repo: string;
	const previousCwd = process.cwd();

	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), "deploy-helpers-preview-git-"));
		git(repo, ["init", "-b", "fresh-unborn"]);
		git(repo, ["config", "user.email", "test@example.com"]);
		git(repo, ["config", "user.name", "Test"]);
		process.chdir(repo);
		clearRepositoryEnv();
	});

	afterEach(() => {
		process.chdir(previousCwd);
		removeDirSync(repo);
	});

	it("does not leak git stderr when CI reads a missing HEAD", ({ expect }) => {
		vi.stubEnv("CI", "true");
		const err = vi.spyOn(process.stderr, "write");
		expect(getHeadCommitRef()).toBeUndefined();
		expect(getHeadCommitMessage()).toBeUndefined();
		const leaked = err.mock.calls
			.map((call) => String(call[0]))
			.join("")
			.includes("fatal:");
		err.mockRestore();
		expect(leaked).toBe(false);
	});

	it("returns the short ref and message after the first commit", ({
		expect,
	}) => {
		writeFileSync(join(repo, "file.txt"), "hi\n");
		git(repo, ["add", "file.txt"]);
		git(repo, ["commit", "-m", "init preview"]);
		expect(getHeadCommitRef()).toBe(
			git(repo, ["rev-parse", "--short", "HEAD"])
		);
		expect(getHeadCommitMessage()).toBe("init preview");
	});

	it("does not leak git stderr when CI has no origin", ({ expect }) => {
		vi.stubEnv("CI", "true");
		const err = vi.spyOn(process.stderr, "write");
		expect(getRepositoryUrl()).toBeUndefined();
		const leaked = err.mock.calls
			.map((call) => String(call[0]))
			.join("")
			.includes("fatal:");
		err.mockRestore();
		expect(leaked).toBe(false);
	});

	it("reads origin only while CI metadata fallback is enabled", ({
		expect,
	}) => {
		git(repo, ["remote", "add", "origin", "git@github.com:example/repo.git"]);
		vi.stubEnv("CI", "");
		expect(getRepositoryUrl()).toBeUndefined();
		vi.stubEnv("CI", "true");
		expect(getRepositoryUrl()).toBe("https://github.com/example/repo");
	});
});
