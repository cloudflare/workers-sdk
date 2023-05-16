import { existsSync, mkdirSync } from "fs";
import { basename, dirname, relative, resolve } from "path";
import { chdir } from "process";
import {
	crash,
	endSection,
	log,
	logRaw,
	newline,
	openInBrowser,
	shapes,
	startSection,
} from "helpers/cli";
import { dim, blue, gray, bgGreen, brandColor } from "helpers/colors";
import {
	detectPackageManager,
	listAccounts,
	runCommand,
	wranglerLogin,
} from "helpers/command";
import { confirmInput, selectInput } from "helpers/interactive";
import { poll } from "helpers/poll";
import type { Option } from "helpers/interactive";
import type { PagesGeneratorArgs, PagesGeneratorContext } from "types";

const { npm } = detectPackageManager();

export const setupProjectDirectory = (args: PagesGeneratorArgs) => {
	// Crash if the directory already exists
	const path = resolve(args.projectName);

	if (existsSync(path)) {
		crash(
			`Directory \`${args.projectName}\` already exists. Please choose a new name.`
		);
	}

	const directory = dirname(path);
	const name = basename(path);

	// resolve the relative path so we can give the user nice instructions
	const relativePath = relative(process.cwd(), path);

	// If the target is a nested directory, create the parent
	mkdirSync(directory, { recursive: true });

	// Change to the parent directory
	chdir(directory);

	return { name, relativePath, path };
};

export const offerToDeploy = async (ctx: PagesGeneratorContext) => {
	startSection(`Deploy with Cloudflare`, `Step 3 of 3`);

	ctx.args.deploy = await confirmInput({
		question: "Do you want to deploy your application?",
		renderSubmitted: (value: boolean) =>
			`${brandColor(value ? `yes` : `no`)} ${dim(
				`deploying via \`${npm} run ${
					ctx.framework?.config.deployCommand ?? "deploy"
				}\``
			)}`,
		initialValue: ctx.args.deploy,
	});

	if (!ctx.args.deploy) return;

	const loginSuccess = await wranglerLogin();
	if (!loginSuccess) return;

	await chooseAccount(ctx);
};

export const runDeploy = async (ctx: PagesGeneratorContext) => {
	if (ctx.args.deploy === false) return;
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}

	const deployCmd = `${npm} run ${
		ctx.framework?.config.deployCommand ?? "deploy"
	}`;
	const result = await runCommand(deployCmd, {
		silent: true,
		cwd: ctx.project.path,
		env: { CLOUDFLARE_ACCOUNT_ID: ctx.account.id },
		startText: `Deploying your application`,
		doneText: `${brandColor("deployed")} ${dim(`via \`${deployCmd}\``)}`,
	});

	const deployedUrlRegex = /https:\/\/.+\.(pages|workers)\.dev/;
	const deployedUrlMatch = result.match(deployedUrlRegex);
	if (deployedUrlMatch) {
		ctx.deployedUrl = deployedUrlMatch[0];
	} else {
		crash("Failed to find deployment url.");
	}

	// if a pages url (<sha1>.<project>.pages.dev), remove the sha1
	if (ctx.deployedUrl?.endsWith(".pages.dev")) {
		const [proto, hostname] = ctx.deployedUrl.split("://");
		const hostnameWithoutSHA1 = hostname.split(".").slice(-3).join("."); // only keep the last 3 parts (discard the 4th, i.e. the SHA1)

		ctx.deployedUrl = `${proto}://${hostnameWithoutSHA1}`;
	}
};

export const chooseAccount = async (ctx: PagesGeneratorContext) => {
	const accounts = await listAccounts();

	let accountId: string;

	if (Object.keys(accounts).length == 1) {
		accountId = Object.values(accounts)[0];
	} else {
		const accountOptions = Object.entries(accounts).map(([name, id]) => ({
			label: name,
			value: id,
		}));

		accountId = await selectInput({
			question: "Which account do you want to use?",
			options: accountOptions,
			renderSubmitted: (option: Option) => {
				return `${brandColor("account")} ${dim(option.label)}`;
			},
		});
	}
	const accountName = Object.keys(accounts).find(
		(name) => accounts[name] == accountId
	) as string;

	ctx.account = { id: accountId, name: accountName };
};

export const printSummary = async (ctx: PagesGeneratorContext) => {
	const nextSteps = [
		[
			`Run the development server`,
			`${npm} run ${ctx.framework?.config.devCommand ?? "start"}`,
		],
		[
			`Deploy your application`,
			`${npm} run ${ctx.framework?.config.deployCommand ?? "deploy"}`,
		],
		[
			`Read the documentation`,
			`https://developers.cloudflare.com/${
				ctx.framework ? "pages" : "workers"
			}`,
		],
		[`Stuck? Join us at`, `https://discord.gg/cloudflaredev`],
	];

	if (ctx.deployedUrl) {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" SUCCESS ")}`,
			`${dim(`View your deployed application at`)}`,
			`${blue(ctx.deployedUrl)}`,
		].join(" ");
		logRaw(msg);
	} else {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" APPLICATION CREATED ")}`,
			`${dim(`Deploy your application with`)}`,
			`${blue(
				`${npm} run ${ctx.framework?.config.deployCommand ?? "deploy"}`
			)}`,
		].join(" ");
		logRaw(msg);
	}

	newline();
	nextSteps.forEach((entry) => {
		log(`${dim(entry[0])} ${blue(entry[1])}`);
	});
	newline();

	if (ctx.deployedUrl) {
		const success = await poll(ctx.deployedUrl);
		if (success) {
			if (ctx.args.open) {
				await openInBrowser(ctx.deployedUrl);
			}
		}
	}
	endSection("See you again soon!");
};
