#!/usr/bin/env node
import { dirname } from "path";
import { chdir } from "process";
import { crash, endSection, logRaw, startSection } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { blue, dim } from "@cloudflare/cli/colors";
import {
	isInteractive,
	spinner,
	spinnerFrames,
} from "@cloudflare/cli/interactive";
import { parseArgs } from "helpers/args";
import { C3_DEFAULTS } from "helpers/cli";
import {
	installWrangler,
	npmInstall,
	rectifyPmMismatch,
	runCommand,
} from "helpers/command";
import { detectPackageManager } from "helpers/packages";
import semver from "semver";
import { version } from "../package.json";
import {
	gitCommit,
	isInsideGitRepo,
	offerGit,
	offerToDeploy,
	printSummary,
	runDeploy,
	setupProjectDirectory,
	validateProjectDirectory,
} from "./common";
import { createProject } from "./pages";
import {
	copyTemplateFiles,
	selectTemplate,
	updatePackageJson,
} from "./templates";
import { installWorkersTypes, updateWranglerToml } from "./workers";
import type { C3Args, C3Context } from "types";

const { npm } = detectPackageManager();

export const main = async (argv: string[]) => {
	const args = await parseArgs(argv);

	// Print a newline
	logRaw("");

	if (args.autoUpdate && (await isUpdateAvailable())) {
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

	const template = await selectTemplate(args);
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

const runTemplate = async (ctx: C3Context) => {
	await create(ctx);
	await configure(ctx);
	await deploy(ctx);

	await printSummary(ctx);
};

const create = async (ctx: C3Context) => {
	const { template } = ctx;

	if (template.generate) {
		await template.generate(ctx);
	}

	await copyTemplateFiles(ctx);
	await updatePackageJson(ctx);

	chdir(ctx.project.path);
	await npmInstall(ctx);
	await rectifyPmMismatch(ctx);

	endSection(`Application created`);
};

const configure = async (ctx: C3Context) => {
	startSection("Configuring your application for Cloudflare", "Step 2 of 3");

	await installWrangler();
	await installWorkersTypes(ctx);

	await updateWranglerToml(ctx);

	const { template } = ctx;
	if (template.configure) {
		await template.configure({ ...ctx });
	}

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

// Detects if a newer version of c3 is available by comparing the version
// specified in package.json with the `latest` tag from npm
const isUpdateAvailable = async () => {
	if (process.env.VITEST || process.env.CI || !isInteractive()) {
		return false;
	}

	// Use a spinner when running this check since it may take some time
	const s = spinner(spinnerFrames.vertical, blue);
	s.start("Checking if a newer version is available");
	const latestVersion = await runCommand(
		["npm", "info", "create-cloudflare@latest", "dist-tags.latest"],
		{ silent: true, useSpinner: false }
	);
	s.stop();

	// Don't auto-update to major versions
	if (semver.diff(latestVersion, version) === "major") return false;

	return semver.gt(latestVersion, version);
};

const printBanner = () => {
	logRaw(dim(`using create-cloudflare version ${version}\n`));
	startSection(`Create an application with Cloudflare`, "Step 1 of 3");
};

main(process.argv).catch((e) => crash(e));
