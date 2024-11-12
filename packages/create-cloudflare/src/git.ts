import { updateStatus } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { getFrameworkCli } from "frameworks/index";
import { processArgument } from "helpers/args";
import { C3_DEFAULTS } from "helpers/cli";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { version as wranglerVersion } from "wrangler/package.json";
import { version } from "../package.json";
import type { C3Context } from "types";

export const offerGit = async (ctx: C3Context) => {
	const gitInstalled = await isGitInstalled();
	if (!gitInstalled) {
		// haven't prompted yet, if provided as --git arg
		if (ctx.args.git) {
			updateStatus(
				"Couldn't find `git` installed on your machine. Continuing without git.",
			);
		}

		// override true (--git flag) and undefined (not prompted yet) to false (don't use git)
		ctx.args.git = false;

		return; // bail early
	}

	const insideGitRepo = await isInsideGitRepo(ctx.project.path);

	if (insideGitRepo) {
		ctx.args.git = true;
		return;
	}

	ctx.args.git = await processArgument(ctx.args, "git", {
		type: "confirm",
		question: "Do you want to use git for version control?",
		label: "git",
		defaultValue: C3_DEFAULTS.git,
	});

	if (!ctx.args.git) {
		return;
	}

	const gitConfigured = await isGitConfigured();
	if (!gitConfigured) {
		updateStatus(
			"Must configure `user.name` and user.email` to use git. Continuing without git.",
		);

		// override ctx.args.git to false (don't use git)
		ctx.args.git = false;
		return;
	}

	await initializeGit(ctx.project.path);
};

export const gitCommit = async (ctx: C3Context) => {
	// Note: createCommitMessage stores the message in ctx so that it can
	//       be used later even if we're not in a git repository, that's why
	//       we unconditionally run this command here
	const commitMessage = await createCommitMessage(ctx);

	if (!ctx.args.git) {
		return;
	}

	// if a git repo existed before the process started then we don't want to commit
	// we only commit if the git repo was initialized (directly or not) by c3
	if (ctx.gitRepoAlreadyExisted) {
		return;
	}

	const gitInstalled = await isGitInstalled();
	const gitInitialized = await isInsideGitRepo(ctx.project.path);

	if (!gitInstalled || !gitInitialized) {
		return;
	}

	const s = spinner();
	s.start("Committing new files");

	await runCommand(["git", "add", "."], {
		silent: true,
		cwd: ctx.project.path,
	});

	await runCommand(["git", "commit", "-m", commitMessage], {
		silent: true,
		cwd: ctx.project.path,
	});

	s.stop(`${brandColor("git")} ${dim(`commit`)}`);
};

const createCommitMessage = async (ctx: C3Context) => {
	const framework = ctx.template.frameworkCli;

	const header = framework
		? "Initialize web application via create-cloudflare CLI"
		: "Initial commit (by create-cloudflare CLI)";

	const packageManager = detectPackageManager();

	const gitVersion = await getGitVersion();
	const insideRepo = await isInsideGitRepo(ctx.project.path);

	const details = [
		{ key: "C3", value: `create-cloudflare@${version}` },
		{ key: "project name", value: ctx.project.name },
		...(framework ? [{ key: "framework", value: ctx.template.id }] : []),
		...(framework
			? [{ key: "framework cli", value: getFrameworkCli(ctx) }]
			: []),
		{
			key: "package manager",
			value: `${packageManager.name}@${packageManager.version}`,
		},
		{
			key: "wrangler",
			value: `wrangler@${wranglerVersion}`,
		},
		{
			key: "git",
			value: insideRepo ? gitVersion : "N/A",
		},
	];

	const body = `Details:\n${details
		.map(({ key, value }) => `  ${key} = ${value}`)
		.join("\n")}\n`;

	const commitMessage = `${header}\n\n${body}\n`;

	ctx.commitMessage = commitMessage;

	return commitMessage;
};

/**
 * Return the version of git on the user's machine, or null if git is not available.
 */
async function getGitVersion() {
	try {
		const rawGitVersion = await runCommand(["git", "--version"], {
			useSpinner: false,
			silent: true,
		});
		// let's remove the "git version " prefix as it isn't really helpful
		const gitVersion = rawGitVersion.replace(/^git\s+version\s+/, "");
		return gitVersion;
	} catch {
		return null;
	}
}

/**
 * Check whether git is available on the user's machine.
 */
export async function isGitInstalled() {
	return (await getGitVersion()) !== null;
}

export async function isGitConfigured() {
	try {
		const userName = await runCommand(["git", "config", "user.name"], {
			useSpinner: false,
			silent: true,
		});
		if (!userName) {
			return false;
		}

		const email = await runCommand(["git", "config", "user.email"], {
			useSpinner: false,
			silent: true,
		});
		if (!email) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

/**
 * Check whether the given current working directory is within a git repository
 * by looking for a `.git` directory in this or an ancestor directory.
 */
export async function isInsideGitRepo(cwd: string) {
	try {
		const output = await runCommand(["git", "status"], {
			cwd,
			useSpinner: false,
			silent: true,
			captureOutput: true,
		});

		return output.includes("not a git repository") === false;
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
	const s = spinner();
	s.start("Initializing git repo");

	try {
		// Get the default init branch name
		const defaultBranchName = await runCommand(
			["git", "config", "--get", "init.defaultBranch"],
			{ useSpinner: false, silent: true, cwd },
		);

		// Try to create the repository with the HEAD branch of defaultBranchName ?? `main`.
		await runCommand(
			["git", "init", "--initial-branch", defaultBranchName.trim() ?? "main"], // branch names can't contain spaces, so this is safe
			{ useSpinner: false, silent: true, cwd },
		);
	} catch {
		// Unable to create the repo with a HEAD branch name, so just fall back to the default.
		await runCommand(["git", "init"], { useSpinner: false, silent: true, cwd });
	} finally {
		s.stop(`${brandColor("initialized")} ${dim(`git`)}`);
	}
}

export async function getProductionBranch(cwd: string) {
	try {
		const productionBranch = await runCommand(
			["git", "branch", "--show-current"],
			{
				silent: true,
				cwd,
				useSpinner: false,
				captureOutput: true,
			},
		);

		return productionBranch.trim();
	} catch (err) {}

	return "main";
}
