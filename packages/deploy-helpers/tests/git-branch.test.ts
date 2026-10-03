import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getBranchName as getAliasBranchName } from "../src/deploy/helpers/preview-alias";
import { getBranchName as getPreviewBranchName } from "../src/preview/shared";

const ciVariables = [
	"WORKERS_CI_BRANCH",
	"GITHUB_HEAD_REF",
	"GITHUB_REF_NAME",
	"CI_COMMIT_REF_NAME",
] as const;

// Use real Git to exercise the process boundary, not just mocked outputs.
for (const [name, getBranchName] of [
	["Preview", getPreviewBranchName],
	["alias", getAliasBranchName],
] as const) {
	describe(`${name} branch detection`, () => {
		let originalCwd: string;
		let directory: string;

		beforeEach(() => {
			originalCwd = process.cwd();
			directory = mkdtempSync(join(tmpdir(), "deploy-helpers-git-"));
			process.chdir(directory);
			for (const variable of ciVariables) {
				vi.stubEnv(variable, "");
			}
		});

		afterEach(() => {
			process.chdir(originalCwd);
			removeDirSync(directory);
			vi.unstubAllEnvs();
		});

		function git(...args: string[]) {
			execFileSync("git", args, { stdio: "ignore" });
		}

		it("returns the current branch without leaking errors in an unborn repository", ({
			expect,
		}) => {
			git("init", "-q", "-b", "feature-test");
			const stderr = vi.spyOn(process.stderr, "write");
			expect(getBranchName()).toBeUndefined();
			expect(stderr).not.toHaveBeenCalled();
			stderr.mockRestore();
			git(
				"-c",
				"user.name=Test",
				"-c",
				"user.email=test@example.com",
				"commit",
				"-q",
				"--allow-empty",
				"-m",
				"init"
			);
			expect(getBranchName()).toBe("feature-test");
		});

		it("returns undefined for a detached checkout", ({ expect }) => {
			git("init", "-q", "-b", "main");
			git(
				"-c",
				"user.name=Test",
				"-c",
				"user.email=test@example.com",
				"commit",
				"-q",
				"--allow-empty",
				"-m",
				"init"
			);
			git("checkout", "-q", "--detach", "HEAD");
			expect(getBranchName()).toBeUndefined();
		});

		it("returns undefined without logging when Git is unavailable", ({
			expect,
		}) => {
			vi.stubEnv("PATH", "");
			const stderr = vi.spyOn(process.stderr, "write");
			expect(getBranchName()).toBeUndefined();
			expect(stderr).not.toHaveBeenCalled();
			stderr.mockRestore();
		});

		it("keeps Workers CI branch precedence over Git", ({ expect }) => {
			vi.stubEnv("WORKERS_CI_BRANCH", "ci-feature");
			expect(getBranchName()).toBe("ci-feature");
			vi.stubEnv("WORKERS_CI_BRANCH", "HEAD");
			expect(getBranchName()).toBe("HEAD");
		});
	});
}

describe("Preview CI branch precedence", () => {
	it("keeps GitHub and GitLab overrides in order", ({ expect }) => {
		vi.stubEnv("WORKERS_CI_BRANCH", "");
		vi.stubEnv("GITHUB_HEAD_REF", "github-pr");
		vi.stubEnv("GITHUB_REF_NAME", "github-ref");
		vi.stubEnv("CI_COMMIT_REF_NAME", "gitlab");
		expect(getPreviewBranchName()).toBe("github-pr");
		vi.stubEnv("GITHUB_HEAD_REF", "");
		expect(getPreviewBranchName()).toBe("github-ref");
		vi.stubEnv("GITHUB_REF_NAME", "");
		expect(getPreviewBranchName()).toBe("gitlab");
		vi.unstubAllEnvs();
	});
});
