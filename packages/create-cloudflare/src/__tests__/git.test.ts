import { updateStatus } from "@cloudflare/cli";
import { mockSpinner } from "helpers/__tests__/mocks";
import { processArgument } from "helpers/args";
import { runCommand } from "helpers/command";
import { beforeEach, describe, test, vi } from "vitest";
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
		test("fully configured", async ({ expect }) => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("email") ? "test@user.com" : "test user"),
			);

			await expect(isGitConfigured()).resolves.toBe(true);
		});

		test("no name", async ({ expect }) => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("email") ? "test@user.com" : ""),
			);
			await expect(isGitConfigured()).resolves.toBe(false);
		});

		test("no email", async ({ expect }) => {
			vi.mocked(runCommand).mockImplementation((cmd) =>
				Promise.resolve(cmd.includes("name") ? "test user" : ""),
			);
			await expect(isGitConfigured()).resolves.toBe(false);
		});

		test("runCommand fails", async ({ expect }) => {
			vi.mocked(runCommand).mockRejectedValue(new Error("git not found"));
			await expect(isGitConfigured()).resolves.toBe(false);
		});
	});

	describe("isGitInstalled", async () => {
		test("installed", async ({ expect }) => {
			mockGitInstalled(true);
			await expect(isGitInstalled()).resolves.toBe(true);
		});

		test("not installed", async ({ expect }) => {
			mockGitInstalled(false);
			await expect(isGitInstalled()).resolves.toBe(false);
		});
	});

	describe("isInsideGitRepo", async () => {
		test("inside git repo", async ({ expect }) => {
			mockInsideGitRepo(true);
			await expect(isInsideGitRepo("")).resolves.toBe(true);
		});
		test("is not inside git repo", async ({ expect }) => {
			mockInsideGitRepo(false);
			await expect(isInsideGitRepo(".")).resolves.toBe(false);
		});
	});

	describe("getProductionBranch", async () => {
		test("happy path", async ({ expect }) => {
			vi.mocked(runCommand).mockResolvedValueOnce("production");
			await expect(getProductionBranch(".")).resolves.toBe("production");
		});

		test("error", async ({ expect }) => {
			vi.mocked(runCommand).mockRejectedValueOnce(new Error());
			await expect(getProductionBranch(".")).resolves.toBe("main");
		});
	});

	describe("initializeGit", async () => {
		test("happy path", async ({ expect }) => {
			mockDefaultBranchName("production");

			await initializeGit(".");
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["git", "init", "--initial-branch", "production"],
				expect.any(Object),
			);
		});

		test("error - fallback to default", async ({ expect }) => {
			vi.mocked(runCommand).mockRejectedValueOnce(new Error());

			await initializeGit(".");
			expect(vi.mocked(runCommand)).toHaveBeenLastCalledWith(
				["git", "init"],
				expect.any(Object),
			);
		});
	});

	describe("offerGit", async () => {
		test("happy path", async ({ expect }) => {
			// The testCreateContext() helper sets up the ctx.args to be all the C3_DEFAULT_ARGS values, which undermines the idea that the user has not provided any command line args.
			// By providing an args object here (and elsewhere in this file) we ensure that none of the CLI args are set so that we have control over them in the tests.

			const ctx = createTestContext("test", { projectName: "test" });
			mockGitInstalled(true);
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
			expect(ctx.gitRepoAlreadyExisted).toBe(false);
			expect(ctx.args.git).toBe(true);
		});

		test("git not installed will not ask the user whether to use git and will not use git", async ({
			expect,
		}) => {
			const ctx = createTestContext("test", { projectName: "test" });
			mockGitInstalled(false);

			await offerGit(ctx);

			expect(updateStatus).not.toHaveBeenCalled();
			expect(processArgument).not.toHaveBeenCalled();
			expect(ctx.args.git).toBe(false);
		});

		test("git not installed, but requested", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test", git: true });
			mockGitInstalled(false);

			await offerGit(ctx);

			expect(updateStatus).toHaveBeenCalledWith(
				expect.stringContaining("Continuing without git"),
			);
			expect(processArgument).not.toHaveBeenCalled();
			expect(ctx.args.git).toBe(false);
		});

		test("git not configured", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			mockGitInstalled(false);

			await offerGit(ctx);

			expect(updateStatus).not.toHaveBeenCalled();
			expect(processArgument).not.toHaveBeenCalled();
			expect(ctx.args.git).toBe(false);
		});

		test("git not configured, but requested", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test", git: true });
			mockGitInstalled(false);

			await offerGit(ctx);

			expect(updateStatus).toHaveBeenCalledWith(
				expect.stringContaining("Continuing without git"),
			);
			expect(processArgument).not.toHaveBeenCalled();
			expect(ctx.args.git).toBe(false);
		});

		test("inside existing git repo", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			// This property is set in the normal ctx creation helper.
			ctx.gitRepoAlreadyExisted = true;
			mockGitInstalled(true);
			mockGitConfig();

			// Mock user selecting true
			vi.mocked(processArgument).mockResolvedValueOnce(true);

			await offerGit(ctx);

			expect(processArgument).toHaveBeenCalledOnce();
			expect(ctx.args.git).toBe(true);
			expect(ctx.gitRepoAlreadyExisted).toBe(true);
			// Should not initialize git since we're in an existing repo
			expect(vi.mocked(runCommand)).not.toHaveBeenCalledWith(
				["git", "init", "--initial-branch", "main"],
				expect.any(Object),
			);
		});

		test("user selects no git", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			mockGitInstalled(true);

			// Mock user selecting true
			vi.mocked(processArgument).mockResolvedValueOnce(false);

			await offerGit(ctx);

			expect(processArgument).toHaveBeenCalledOnce();

			expect(vi.mocked(runCommand)).toHaveBeenCalledOnce();
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				expect.arrayContaining(["git", "--version"]),
				expect.any(Object),
			);

			expect(ctx.args.git).toBe(false);
		});

		test("user selects no git, inside a git repository", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			ctx.gitRepoAlreadyExisted = true;
			mockGitInstalled(true);

			// Mock user selecting true
			vi.mocked(processArgument).mockResolvedValueOnce(false);

			await offerGit(ctx);

			expect(processArgument).toHaveBeenCalledOnce();

			expect(vi.mocked(runCommand)).toHaveBeenCalledOnce();
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				expect.arrayContaining(["git", "--version"]),
				expect.any(Object),
			);

			expect(ctx.args.git).toBe(false);
		});
	});

	describe("gitCommit", async () => {
		let spinner: ReturnType<typeof mockSpinner>;

		beforeEach(() => {
			spinner = mockSpinner();
			mockGitInstalled(true);
		});

		test("happy path", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			ctx.args.git = true;

			await gitCommit(ctx);

			expect(spinner.start).toHaveBeenCalledOnce();
			// This is called when creating the git commit message
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				expect.arrayContaining(["git", "--version"]),
				expect.any(Object),
			);
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["git", "add", "."],
				expect.any(Object),
			);
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["git", "commit", "-m", expect.any(String), "--no-verify"],
				expect.any(Object),
			);
			expect(spinner.stop).toHaveBeenCalledOnce();
			expect(ctx.commitMessage).toBeDefined();
		});

		test("git not selected", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			ctx.args.git = false;

			await gitCommit(ctx);

			expect(spinner.start).not.toHaveBeenCalled();
			expect(spinner.stop).not.toHaveBeenCalled();

			expect(vi.mocked(runCommand)).toHaveBeenCalledOnce();
			// This is called when creating the git commit message
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				expect.arrayContaining(["git", "--version"]),
				expect.any(Object),
			);

			expect(ctx.commitMessage).toBeDefined();
		});

		test("git repo already existed", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			ctx.args.git = true;
			ctx.gitRepoAlreadyExisted = true;

			await gitCommit(ctx);

			expect(spinner.start).not.toHaveBeenCalled();
			expect(spinner.stop).not.toHaveBeenCalled();

			expect(vi.mocked(runCommand)).toHaveBeenCalledOnce();
			// This is called when creating the git commit message
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				expect.arrayContaining(["git", "--version"]),
				expect.any(Object),
			);

			expect(ctx.commitMessage).toBeDefined();
		});

		test("commit failure is handled gracefully", async ({ expect }) => {
			const ctx = createTestContext("test", { projectName: "test" });
			ctx.args.git = true;

			// Note: beforeEach already sets up git --version mock via mockGitInstalled(true)
			// So we only need to mock git add and git commit
			vi.mocked(runCommand)
				.mockResolvedValueOnce("") // git add
				.mockRejectedValueOnce(
					new Error("gpg: signing failed: Operation cancelled"),
				);

			// Should not throw
			await expect(gitCommit(ctx)).resolves.not.toThrow();

			expect(spinner.start).toHaveBeenCalledOnce();
			expect(spinner.stop).toHaveBeenCalledOnce();
			expect(updateStatus).toHaveBeenCalledWith(
				expect.stringContaining("Failed to create initial commit"),
			);
			expect(ctx.commitMessage).toBeDefined();
		});
	});
});
