import { existsSync, mkdirSync, readdirSync } from "fs";
import { basename, dirname, relative, resolve } from "path";
import { chdir } from "process";
import {
	crash,
	endSection,
	log,
	logRaw,
	newline,
	shapes,
	startSection,
	updateStatus,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { bgGreen, blue, brandColor, dim, gray } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { getFrameworkCli } from "frameworks/index";
import { C3_DEFAULTS, openInBrowser } from "helpers/cli";
import {
	listAccounts,
	printAsyncStatus,
	runCommand,
	runCommands,
	wranglerLogin,
} from "helpers/command";
import { detectPackageManager } from "helpers/packages";
import { poll } from "helpers/poll";
import { quote } from "shell-quote";
import { version as wranglerVersion } from "wrangler/package.json";
import { version } from "../package.json";
import { readWranglerToml } from "./workers";
import type { C3Args, C3Context } from "types";

const { name, npm } = detectPackageManager();

export const validateProjectDirectory = (
	relativePath: string,
	args: Partial<C3Args>
) => {
	// Validate that the directory is non-existent or empty
	const path = resolve(relativePath);
	const existsAlready = existsSync(path);

	if (existsAlready) {
		for (const file of readdirSync(path)) {
			if (!isAllowedExistingFile(file)) {
				return `Directory \`${relativePath}\` already exists and contains files that might conflict. Please choose a new name.`;
			}
		}
	}

	// Ensure the name is valid per the pages schema
	// Skip this if we're initializing from an existing workers script, since some
	// previously created workers may have names containing capital letters
	if (!args.existingScript) {
		const projectName = basename(path);
		const invalidChars = /[^a-z0-9-]/;
		const invalidStartEnd = /^-|-$/;

		if (projectName.match(invalidStartEnd)) {
			return `Project names cannot start or end with a dash.`;
		}

		if (projectName.match(invalidChars)) {
			return `Project names must only contain lowercase characters, numbers, and dashes.`;
		}

		if (projectName.length > 58) {
			return `Project names must be less than 58 characters.`;
		}
	}
};

export const isAllowedExistingFile = (file: string) => {
	// C3 shouldn't prevent a user from using an existing directory if it
	// only contains benign config and/or other files from the following set
	const allowedExistingFiles = new Set([
		".DS_Store",
		".git",
		".gitattributes",
		".gitignore",
		".gitlab-ci.yml",
		".hg",
		".hgcheck",
		".hgignore",
		".idea",
		".npmignore",
		".travis.yml",
		".vscode",
		"Thumbs.db",
		"docs",
		"mkdocs.yml",
		"npm-debug.log",
		"yarn-debug.log",
		"yarn-error.log",
		"yarnrc.yml",
		".yarn",
		".gitkeep",
	]);

	if (allowedExistingFiles.has(file)) return true;

	const allowedExistingPatters = [
		/readme(\.md)?$/i,
		/license(\.md)?$/i,
		/\.iml$/,
		/^npm-debug\.log/,
		/^yarn-debug\.log/,
		/^yarn-error\.log/,
	];

	for (const regex of allowedExistingPatters) {
		if (regex.test(file)) return true;
	}

	return false;
};

export const setupProjectDirectory = (args: C3Args) => {
	// Crash if the directory already exists
	const path = resolve(args.projectName);
	const err = validateProjectDirectory(path, args);
	if (err) {
		crash(err);
	}

	const directory = dirname(path);
	const pathBasename = basename(path);

	// If the target is a nested directory, create the parent
	mkdirSync(directory, { recursive: true });

	// Change to the parent directory
	chdir(directory);

	return { name: pathBasename, path };
};

export const offerToDeploy = async (ctx: C3Context) => {
	startSection(`Deploy with Cloudflare`, `Step 3 of 3`);

	// Coerce no-deploy if it isn't possible (i.e. if its a worker with any bindings)
	if (!(await isDeployable(ctx))) {
		ctx.args.deploy = false;
	}

	const label = `deploy via \`${quoteShellArgs([
		npm,
		"run",
		...(ctx.template.deployCommand ?? ["deploy"]),
	])}\``;

	ctx.args.deploy = await processArgument(ctx.args, "deploy", {
		type: "confirm",
		question: "Do you want to deploy your application?",
		label,
		defaultValue: C3_DEFAULTS.deploy,
	});

	if (!ctx.args.deploy) return;

	// initialize a deployment object in context
	ctx.deployment = {};

	const loginSuccess = await wranglerLogin();
	if (!loginSuccess) return;

	await chooseAccount(ctx);
};

/**
 * Determines if the current project is deployable.
 *
 * Since C3 doesn't currently support a way to automatically provision the resources needed
 * by bindings, templates that have placeholder bindings will need some adjustment by the project author
 * before they can be deployed.
 */
const isDeployable = async (ctx: C3Context) => {
	if (ctx.template.platform === "pages") {
		return true;
	}

	const wranglerToml = await readWranglerToml(ctx);
	if (wranglerToml.match(/(?<!#\s*)bindings?\s*=.*/m)) {
		return false;
	}

	return true;
};

export const runDeploy = async (ctx: C3Context) => {
	if (ctx.args.deploy === false) return;
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}

	const baseDeployCmd = [
		npm,
		"run",
		...(ctx.template.deployCommand ?? ["deploy"]),
	];

	const insideGitRepo = await isInsideGitRepo(ctx.project.path);

	const deployCmd = [
		...baseDeployCmd,
		// Important: the following assumes that all framework deploy commands terminate with `wrangler pages deploy`
		...(ctx.template.platform === "pages" && ctx.commitMessage && !insideGitRepo
			? [
					...(name === "npm" ? ["--"] : []),
					"--commit-message",
					prepareCommitMessage(ctx.commitMessage),
			  ]
			: []),
	];

	const result = await runCommand(deployCmd, {
		silent: true,
		cwd: ctx.project.path,
		env: { CLOUDFLARE_ACCOUNT_ID: ctx.account.id, NODE_ENV: "production" },
		startText: "Deploying your application",
		doneText: `${brandColor("deployed")} ${dim(
			`via \`${quoteShellArgs(baseDeployCmd)}\``
		)}`,
	});

	const deployedUrlRegex = /https:\/\/.+\.(pages|workers)\.dev/;
	const deployedUrlMatch = result.match(deployedUrlRegex);
	if (deployedUrlMatch) {
		ctx.deployment.url = deployedUrlMatch[0];
	} else {
		crash("Failed to find deployment url.");
	}

	// if a pages url (<sha1>.<project>.pages.dev), remove the sha1
	if (ctx.deployment.url?.endsWith(".pages.dev")) {
		const [proto, hostname] = ctx.deployment.url.split("://");
		const hostnameWithoutSHA1 = hostname.split(".").slice(-3).join("."); // only keep the last 3 parts (discard the 4th, i.e. the SHA1)

		ctx.deployment.url = `${proto}://${hostnameWithoutSHA1}`;
	}
};

export const chooseAccount = async (ctx: C3Context) => {
	const s = spinner();
	s.start(`Selecting Cloudflare account ${dim("retrieving accounts")}`);
	const accounts = await listAccounts();

	let accountId: string;

	if (Object.keys(accounts).length == 1) {
		const accountName = Object.keys(accounts)[0];
		accountId = accounts[accountName];
		s.stop(`${brandColor("account")} ${dim(accountName)}`);
	} else {
		s.stop(
			`${brandColor("account")} ${dim("more than one account available")}`
		);
		const accountOptions = Object.entries(accounts).map(
			([accountName, id]) => ({
				label: accountName,
				value: id,
			})
		);

		accountId = await inputPrompt({
			type: "select",
			question: "Which account do you want to use?",
			options: accountOptions,
			label: "account",
			defaultValue: accountOptions[0].value,
		});
	}
	const accountName = Object.keys(accounts).find(
		(account) => accounts[account] == accountId
	) as string;

	ctx.account = { id: accountId, name: accountName };
};

export const printSummary = async (ctx: C3Context) => {
	const dirRelativePath = relative(ctx.originalCWD, ctx.project.path);
	const nextSteps = [
		dirRelativePath
			? [`Navigate to the new directory`, `cd ${dirRelativePath}`]
			: [],
		[
			`Run the development server`,
			quoteShellArgs([npm, "run", ...(ctx.template.devCommand ?? ["start"])]),
		],
		[
			`Deploy your application`,
			quoteShellArgs([
				npm,
				"run",
				...(ctx.template.deployCommand ?? ["deploy"]),
			]),
		],
		[
			`Read the documentation`,
			`https://developers.cloudflare.com/${ctx.template.platform}`,
		],
		[`Stuck? Join us at`, `https://discord.gg/cloudflaredev`],
	];

	if (ctx.deployment.url) {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" SUCCESS ")}`,
			`${dim(`View your deployed application at`)}`,
			`${blue(ctx.deployment.url)}`,
		].join(" ");
		logRaw(msg);
	} else {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" APPLICATION CREATED ")}`,
			`${dim(`Deploy your application with`)}`,
			`${blue(
				quoteShellArgs([
					npm,
					"run",
					...(ctx.template.deployCommand ?? ["deploy"]),
				])
			)}`,
		].join(" ");
		logRaw(msg);
	}

	newline();
	nextSteps.forEach((entry) => {
		log(`${dim(entry[0])} ${blue(entry[1])}`);
	});
	newline();

	if (ctx.deployment.url) {
		const success = await poll(ctx.deployment.url);
		if (success) {
			if (ctx.args.open) {
				await openInBrowser(ctx.deployment.url);
			}
		}
	}
	endSection("See you again soon!");
	process.exit(0);
};

export const offerGit = async (ctx: C3Context) => {
	const gitInstalled = await isGitInstalled();
	if (!gitInstalled) {
		// haven't prompted yet, if provided as --git arg
		if (ctx.args.git) {
			updateStatus(
				"Couldn't find `git` installed on your machine. Continuing without git."
			);
		}

		// override true (--git flag) and undefined (not prompted yet) to false (don't use git)
		ctx.args.git = false;

		return; // bail early
	}

	const gitConfigured = await isGitConfigured();
	if (!gitConfigured) {
		// haven't prompted yet, if provided as --git arg
		if (ctx.args.git) {
			updateStatus(
				"Must configure `user.name` and user.email` to use git. Continuing without git."
			);
		}

		// override true (--git flag) and undefined (not prompted yet) to false (don't use git)
		ctx.args.git = false;

		return; // bail early
	}

	const insideGitRepo = await isInsideGitRepo(ctx.project.path);

	if (insideGitRepo) return;

	ctx.args.git = await processArgument(ctx.args, "git", {
		type: "confirm",
		question: "Do you want to use git for version control?",
		label: "git",
		defaultValue: C3_DEFAULTS.git,
	});

	if (ctx.args.git) {
		await printAsyncStatus({
			promise: initializeGit(ctx.project.path),
			startText: "Initializing git repo",
			doneText: `${brandColor("initialized")} ${dim(`git`)}`,
		});
	}
};

export const gitCommit = async (ctx: C3Context) => {
	// Note: createCommitMessage stores the message in ctx so that it can
	//       be used later even if we're not in a git repository, that's why
	//       we unconditionally run this command here
	const commitMessage = await createCommitMessage(ctx);

	// if a git repo existed before the process started then we don't want to commit
	// we only commit if the git repo was initialized (directly or not) by c3
	if (ctx.gitRepoAlreadyExisted) return;

	if (!(await isGitInstalled()) || !(await isInsideGitRepo(ctx.project.path)))
		return;

	await runCommands({
		silent: true,
		cwd: ctx.project.path,
		commands: [
			["git", "add", "."],
			["git", "commit", "-m", commitMessage],
		],
		startText: "Committing new files",
		doneText: `${brandColor("git")} ${dim(`commit`)}`,
	});
};

const createCommitMessage = async (ctx: C3Context) => {
	const isPages = ctx.template.platform === "pages";

	const header = isPages
		? "Initialize web application via create-cloudflare CLI"
		: "Initial commit (by create-cloudflare CLI)";

	const packageManager = detectPackageManager();

	const gitVersion = await getGitVersion();
	const insideRepo = await isInsideGitRepo(ctx.project.path);

	const details = [
		{ key: "C3", value: `create-cloudflare@${version}` },
		{ key: "project name", value: ctx.project.name },
		...(isPages ? [{ key: "framework", value: ctx.template.id }] : []),
		...(isPages ? [{ key: "framework cli", value: getFrameworkCli(ctx) }] : []),
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
		if (!userName) return false;

		const email = await runCommand(["git", "config", "user.email"], {
			useSpinner: false,
			silent: true,
		});
		if (!email) return false;

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
	try {
		// Get the default init branch name
		const defaultBranchName = await runCommand(
			["git", "config", "--get", "init.defaultBranch"],
			{ useSpinner: false, silent: true, cwd }
		);

		// Try to create the repository with the HEAD branch of defaultBranchName ?? `main`.
		await runCommand(
			["git", "init", "--initial-branch", defaultBranchName.trim() ?? "main"], // branch names can't contain spaces, so this is safe
			{ useSpinner: false, silent: true, cwd }
		);
	} catch {
		// Unable to create the repo with a HEAD branch name, so just fall back to the default.
		await runCommand(["git", "init"], { useSpinner: false, silent: true, cwd });
	}
}

export async function getProductionBranch(cwd: string) {
	try {
		const productionBranch = await runCommand(
			// "git branch --show-current", // git@^2.22
			["git", "rev-parse", "--abbrev-ref", "HEAD"], // git@^1.6.3
			{
				silent: true,
				cwd,
				useSpinner: false,
				captureOutput: true,
			}
		);

		return productionBranch.trim();
	} catch (err) {}

	return "main";
}

/**
 * Ensure that the commit message has newlines etc properly escaped.
 */
function prepareCommitMessage(commitMessage: string): string {
	return JSON.stringify(commitMessage);
}

export function quoteShellArgs(args: string[]): string {
	if (process.platform !== "win32") {
		return quote(args);
	} else {
		// Simple Windows command prompt quoting if there are special characters.
		const specialCharsMatcher = /[&<>[\]|{}^=;!'+,`~\s]/;
		return args
			.map((arg) =>
				arg.match(specialCharsMatcher) ? `"${arg.replaceAll(`"`, `""`)}"` : arg
			)
			.join(" ");
	}
}
