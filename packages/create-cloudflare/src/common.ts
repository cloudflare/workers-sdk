import { mkdirSync } from "fs";
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
import { C3_DEFAULTS, openInBrowser } from "helpers/cli";
import { quoteShellArgs, runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { poll } from "helpers/poll";
import { isInsideGitRepo } from "./git";
import { validateProjectDirectory } from "./validators";
import { listAccounts, wranglerLogin } from "./wrangler/accounts";
import { readWranglerToml } from "./wrangler/config";
import type { C3Args, C3Context } from "types";

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
	const { npm } = detectPackageManager();

	startSection(`Deploy with Cloudflare`, `Step 3 of 3`);

	// Coerce no-deploy if it isn't possible (i.e. if its a worker with any bindings)
	if (!(await isDeployable(ctx))) {
		ctx.args.deploy = false;
		updateStatus(
			`Bindings must be configured in ${blue(
				"`wrangler.toml`"
			)} before your application can be deployed`
		);
	}

	const label = `deploy via \`${quoteShellArgs([
		npm,
		"run",
		ctx.template.deployScript ?? "deploy",
	])}\``;

	const shouldDeploy = await processArgument(ctx.args, "deploy", {
		type: "confirm",
		question: "Do you want to deploy your application?",
		label,
		defaultValue: C3_DEFAULTS.deploy,
	});

	if (!shouldDeploy) {
		return false;
	}

	// initialize a deployment object in context
	ctx.deployment = {};

	const loginSuccess = await wranglerLogin();
	if (!loginSuccess) return false;

	await chooseAccount(ctx);

	return true;
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

	const wranglerToml = readWranglerToml(ctx);
	if (wranglerToml.match(/(?<!#\s*)bindings?\s*=.*/m)) {
		return false;
	}

	return true;
};

export const runDeploy = async (ctx: C3Context) => {
	const { npm, name: pm } = detectPackageManager();

	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}

	const baseDeployCmd = [npm, "run", ctx.template.deployScript ?? "deploy"];

	const insideGitRepo = await isInsideGitRepo(ctx.project.path);

	const deployCmd = [
		...baseDeployCmd,
		// Important: the following assumes that all framework deploy commands terminate with `wrangler pages deploy`
		...(ctx.template.platform === "pages" && ctx.commitMessage && !insideGitRepo
			? [
					...(pm === "npm" ? ["--"] : []),
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
	const { npm } = detectPackageManager();

	const dirRelativePath = relative(ctx.originalCWD, ctx.project.path);
	const nextSteps = [
		dirRelativePath
			? ["Navigate to the new directory", `cd ${dirRelativePath}`]
			: [],
		[
			"Run the development server",
			quoteShellArgs([npm, "run", ctx.template.devScript ?? "start"]),
		],
		...(ctx.template.previewScript
			? [
					[
						"Preview your application",
						quoteShellArgs([npm, "run", ctx.template.previewScript]),
					],
			  ]
			: []),
		[
			"Deploy your application",
			quoteShellArgs([npm, "run", ctx.template.deployScript ?? "deploy"]),
		],
		[
			"Read the documentation",
			`https://developers.cloudflare.com/${ctx.template.platform}`,
		],
		["Stuck? Join us at", "https://discord.gg/cloudflaredev"],
	];

	if (ctx.deployment.url) {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" SUCCESS ")}`,
			`${dim("View your deployed application at")}`,
			`${blue(ctx.deployment.url)}`,
		].join(" ");
		logRaw(msg);
	} else {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" APPLICATION CREATED ")}`,
			`${dim("Deploy your application with")}`,
			`${blue(
				quoteShellArgs([npm, "run", ctx.template.deployScript ?? "deploy"])
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

/**
 * Ensure that the commit message has newlines etc properly escaped.
 */
function prepareCommitMessage(commitMessage: string): string {
	return JSON.stringify(commitMessage);
}
