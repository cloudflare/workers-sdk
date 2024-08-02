#!/usr/bin/env node
import { mkdirSync } from "fs";
import { basename, dirname, resolve } from "path";
import { chdir } from "process";
import { crash, endSection, logRaw, startSection } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { isInteractive } from "@cloudflare/cli/interactive";
import { parseArgs } from "helpers/args";
import { C3_DEFAULTS, isUpdateAvailable } from "helpers/cli";
import { runCommand } from "helpers/command";
import {
	detectPackageManager,
	rectifyPmMismatch,
} from "helpers/packageManagers";
import { installWrangler, npmInstall } from "helpers/packages";
import { version } from "../package.json";
import { maybeOpenBrowser, offerToDeploy, runDeploy } from "./deploy";
import { printSummary, printWelcomeMessage } from "./dialog";
import { gitCommit, isInsideGitRepo, offerGit } from "./git";
import { createProject } from "./pages";
import {
	addWranglerToGitIgnore,
	copyTemplateFiles,
	selectTemplate,
	updatePackageName,
	updatePackageScripts,
} from "./templates";
import { validateProjectDirectory } from "./validators";
import { installWorkersTypes } from "./workers";
import { updateWranglerToml } from "./wrangler/config";
import type { C3Args, C3Context } from "types";

const { npm } = detectPackageManager();

export const main = async (argv: string[]) => {
	const args = await parseArgs(argv);

	// Print a newline
	logRaw("");

	if (
		args.autoUpdate &&
		!process.env.VITEST &&
		!process.env.CI &&
		isInteractive() &&
		(await isUpdateAvailable())
	) {
		await runLatest();
	} else {
		await runCli(args);
	}
};

// Spawn a separate process running the most recent version of c3
export const runLatest = async () => {
	const args = process.argv.slice(2);

	// the parsing logic of `npm create` requires `--` to be supplied
	// before any flags intended for the target command.
	if (npm === "npm") {
		args.unshift("--");
	}

	await runCommand([npm, "create", "cloudflare@latest", ...args]);
};

// Entrypoint to c3
export const runCli = async (args: Partial<C3Args>) => {
	printBanner();

	const defaultName = args.existingScript || C3_DEFAULTS.projectName;

	const projectName = await processArgument<string>(args, "projectName", {
		type: "text",
		question: `In which directory do you want to create your application?`,
		helpText: "also used as application name",
		defaultValue: defaultName,
		label: "dir",
		validate: (value) =>
			validateProjectDirectory(String(value) || C3_DEFAULTS.projectName, args),
		format: (val) => `./${val}`,
	});

	const validatedArgs: C3Args = {
		...args,
		projectName,
	};

	const originalCWD = process.cwd();
	const { name, path } = setupProjectDirectory(validatedArgs);

	const template = await selectTemplate(validatedArgs);
	const ctx: C3Context = {
		project: { name, path },
		args: validatedArgs,
		template,
		originalCWD,
		gitRepoAlreadyExisted: await isInsideGitRepo(dirname(path)),
		deployment: {},
	};

	await runTemplate(ctx);
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

const runTemplate = async (ctx: C3Context) => {
	await create(ctx);
	await configure(ctx);
	await deploy(ctx);

	await printSummary(ctx);
	await maybeOpenBrowser(ctx);

	endSection("See you again soon!");
	process.exit(0);
};

const create = async (ctx: C3Context) => {
	const { template } = ctx;

	if (template.generate) {
		await template.generate(ctx);
	}

	await copyTemplateFiles(ctx);
	await updatePackageName(ctx);

	chdir(ctx.project.path);
	await npmInstall(ctx);
	await rectifyPmMismatch(ctx);

	endSection(`Application created`);
};

const configure = async (ctx: C3Context) => {
	startSection("Configuring your application for Cloudflare", "Step 2 of 3");

	await installWrangler();
	await installWorkersTypes(ctx);

	// Note: updateWranglerToml _must_ be called before the configure phase since
	//       pre-existing workers assume its presence in their configure phase
	await updateWranglerToml(ctx);

	const { template } = ctx;
	if (template.configure) {
		await template.configure({ ...ctx });
	}

	addWranglerToGitIgnore(ctx);

	await updatePackageScripts(ctx);

	await offerGit(ctx);
	await gitCommit(ctx);

	endSection(`Application configured`);
};

const deploy = async (ctx: C3Context) => {
	if (await offerToDeploy(ctx)) {
		await createProject(ctx);
		await runDeploy(ctx);
	}
};

const printBanner = () => {
	printWelcomeMessage(version);
	startSection(`Create an application with Cloudflare`, "Step 1 of 3");
};

main(process.argv).catch((e) => crash(e));
