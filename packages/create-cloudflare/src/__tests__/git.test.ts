import { updateStatus } from "@cloudflare/cli";
import { mockSpinner } from "helpers/__tests__/mocks";
import { processArgument } from "helpers/args";
import { runCommand } from "helpers/command";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	getProductionBranch,
	gitCommit,
	initializeGit,
	isGitConfigured,
	isGitInstalled,
	isInsideGitRepo,
	offerGit,
} from "../git";
import { createTestContext } from "./helpers";

vi.mock("helpers/command");
vi.mock("helpers/args");
vi.mock("@cloudflare/cli/interactive");
vi.mock("@cloudflare/cli");

beforeEach(() => {
	mockSpinner();
});

const mockGitInstalled = (isInstalled = true) => {
	if (isInstalled) {
		vi.mocked(runCommand).mockResolvedValueOnce(
			"git version 2.20.2 (Apple Git-100)",
		);
	} else {
		vi.mocked(runCommand).mockRejectedValueOnce(
			new Error("zsh: command not found: git"),
		);
	}
};

const mockGitConfig = () => {
	vi.mocked(runCommand).mockResolvedValueOnce("test user");
	vi.mocked(runCommand).mockResolvedValueOnce("test@user.com");
};

const mockInsideGitRepo = (isInside: boolean) => {
	if (isInside) {
		vi.mocked(runCommand).mockResolvedValueOnce(
			"On branch master\nnothing to commit, working tree clean",
		);
	} else {
		vi.mocked(runCommand).mockRejectedValueOnce(
			new Error(
				"fatal: not a git repository (or any of the parent directories): .git",
			),
		);
	}
};

const mockDefaultBranchName = (branch = "main") => {
	vi.mocked(runCommand).mockResolvedValueOnce(branch);
};

describe("git helpers", () => {
	describe("isGitConfigured", () => {
		test("fully configured", async () => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("email") ? "test@user.com" : "test user"),
			);

			await expect(isGitConfigured()).resolves.toBe(true);
		});

		test("no name", async () => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("email") ? "test@user.com" : ""),
			);
			await expect(isGitConfigured()).resolves.toBe(false);
		});

		test("no email", async () => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("name") ? "test user" : ""),
			);
			await expect(isGitConfigured()).resolves.toBe(false);
		});

		test("runCommand fails", async () => {
			vi.mocked(runCommand).mockRejectedValue(new Error("git not found"));
			await expect(isGitConfigured()).resolves.toBe(false);
		});
	});

	describe("isGitInstalled", async () => {
		test("installed", async () => {
			mockGitInstalled(true);
			await expect(isGitInstalled()).resolves.toBe(true);
		});

		test("not installed", async () => {
			mockGitInstalled(false);
			await expect(isGitInstalled()).resolves.toBe(false);
		});
	});

	describe("isInsideGitRepo", async () => {
		test("inside git repo", async () => {
			mockInsideGitRepo(true);
			await expect(isInsideGitRepo("")).resolves.toBe(true);
		});
		test("is not inside git repo", async () => {
			mockInsideGitRepo(false);
			await expect(isInsideGitRepo(".")).resolves.toBe(false);
		});
	});

	describe("getProductionBranch", async () => {
		test("happy path", async () => {
			vi.mocked(runCommand).mockResolvedValueOnce("production");
			await expect(getProductionBranch(".")).resolves.toBe("production");
		});

		test("error", async () => {
			vi.mocked(runCommand).mockRejectedValueOnce(new Error());
			await expect(getProductionBranch(".")).resolves.toBe("main");
		});
	});

	describe("initializeGit", async () => {
		test("happy path", async () => {
			mockDefaultBranchName("production");

			await initializeGit(".");
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["git", "init", "--initial-branch", "production"],
				expect.any(Object),
			);
		});

		test("error - fallback to default", async () => {
			vi.mocked(runCommand).mockRejectedValueOnce(new Error());

			await initializeGit(".");
			expect(vi.mocked(runCommand)).toHaveBeenLastCalledWith(
				["git", "init"],
				expect.any(Object),
			);
		});
	});

	describe("offerGit", async () => {
		test("happy path", async () => {
			const ctx = createTestContext();
			mockGitInstalled(true);
			mockInsideGitRepo(false);
			mockGitConfig();
			mockDefaultBranchName();

			// Mock user selecting true
			vi.mocked(processArgument).mockResolvedValueOnce(true);

			await offerGit(ctx);

			expect(processArgument).toHaveBeenCalledOnce();
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["git", "init", "--initial-branch", "main"],
				expect.any(Object),
			);
			expect(ctx.args.git).toBe(true);
		});

		test("git not installed", async () => {
			const ctx = createTestContext();
			mockGitInstalled(false);

			await offerGit(ctx);

			expect(updateStatus).toHaveBeenCalledWith(
				expect.stringContaining("Continuing without git"),
			);
			expect(processArgument).not.toHaveBeenCalled();
			expect(ctx.args.git).toBe(false);
		});

		test("git not configured", async () => {
			const ctx = createTestContext();
			mockGitInstalled(false);
			vi.mocked(runCommand).mockRejectedValue(new Error("git not found"));

			await offerGit(ctx);

			expect(updateStatus).toHaveBeenCalledWith(
				expect.stringContaining("Continuing without git"),
			);
			expect(processArgument).not.toHaveBeenCalled();
			expect(ctx.args.git).toBe(false);
		});

		test("inside existing git repo", async () => {
			const ctx = createTestContext("test", { projectName: "test" });
			mockGitInstalled(true);
			mockGitConfig();
			mockInsideGitRepo(true);

			await offerGit(ctx);

			expect(processArgument).not.toHaveBeenCalledOnce();
			expect(ctx.args.git).toBe(true);
		});

		test("user selects no git", async () => {
			const ctx = createTestContext();
			mockGitInstalled(true);
			mockGitConfig();
			mockInsideGitRepo(false);
			mockDefaultBranchName();

			// Mock user selecting true
			vi.mocked(processArgument).mockResolvedValueOnce(false);

			await offerGit(ctx);

			expect(processArgument).toHaveBeenCalledOnce();
			expect(vi.mocked(runCommand)).not.toHaveBeenCalledWith(
				["git", "init", "--initial-branch", "main"],
				expect.any(Object),
			);
			expect(ctx.args.git).toBe(false);
		});
	});

	describe("gitCommit", async () => {
		let spinner: ReturnType<typeof mockSpinner>;

		beforeEach(() => {
			spinner = mockSpinner();
			// Mocks for `createCommitMessage`
			mockGitInstalled(true);
			mockInsideGitRepo(true);
		});

		test("happy path", async () => {
			const ctx = createTestContext();
			ctx.gitRepoAlreadyExisted = false;

			mockGitInstalled(true);
			mockInsideGitRepo(true);

			await gitCommit(ctx);

			expect(spinner.start).toHaveBeenCalledOnce();
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["git", "add", "."],
				expect.any(Object),
			);
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["git", "commit", "-m", expect.any(String)],
				expect.any(Object),
			);
			expect(spinner.stop).toHaveBeenCalledOnce();
		});

		test("git repo already existed (early exit)", async () => {
			const ctx = createTestContext();
			ctx.gitRepoAlreadyExisted = true;

			await gitCommit(ctx);

			expect(spinner.start).not.toHaveBeenCalled();
			expect(spinner.stop).not.toHaveBeenCalled();
			expect(vi.mocked(runCommand)).not.toHaveBeenCalledWith(
				["git", "commit", "-m", expect.any(String)],
				expect.any(Object),
			);
		});

		const cases = [
			[true, false],
			[false, true],
			[false, false],
		];

		test.each(cases)(
			"early exit (git installed: %s, git initialized: %s)",
			async (gitInstalled, gitInitialized) => {
				const ctx = createTestContext();
				ctx.gitRepoAlreadyExisted = true;

				mockGitInstalled(gitInstalled);
				mockInsideGitRepo(gitInitialized);

				await gitCommit(ctx);

				expect(spinner.start).not.toHaveBeenCalled();
				expect(spinner.stop).not.toHaveBeenCalled();
				expect(vi.mocked(runCommand)).not.toHaveBeenCalledWith(
					["git", "commit", "-m", expect.any(String)],
					expect.any(Object),
				);
			},
		);
	});
});
