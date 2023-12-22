#!/usr/bin/env node
import { dirname } from "path";
import { processArgument } from "@cloudflare/cli/args";
import { crash, endSection, logRaw, startSection } from "@cloudflare/cli";
import { blue, dim } from "@cloudflare/cli/colors";
import {
	isInteractive,
	spinner,
	spinnerFrames,
} from "@cloudflare/cli/interactive";
import { parseArgs } from "helpers/args";
import { C3_DEFAULTS } from "helpers/cli";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packages";
import { generateTypes } from "helpers/wrangler";
import semver from "semver";
import { version } from "../package.json";
import { bindResources } from "./bindings";
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
import { createProject, runPagesGenerator } from "./pages";
import { selectTemplate, updatePackageJson } from "./templateMap";
import { createWranglerToml, runWorkersGenerator } from "./workers";
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
		deployment: {
			queues: {},
			kvNamespaces: {},
		},
	};

	await runTemplate(ctx);
};

const runTemplate = async (ctx: C3Context) => {
	// As time goes on, lift increasingly more logic out of the generators into here
	if (ctx.template.platform === "workers") {
		await runWorkersGenerator(ctx);
	} else {
		await runPagesGenerator(ctx);
	}

	await updatePackageJson(ctx);
	await createWranglerToml(ctx);
	await offerGit(ctx);
	// TODO: this needs to be moved to after bindings since that might
	// change wrangler.toml
	await gitCommit(ctx);
	endSection(`Application configured`);

	// Deploy
	await offerToDeploy(ctx);
	await bindResources(ctx);
	await createProject(ctx);
	await generateTypes(ctx);
	await runDeploy(ctx);

	// Summary
	await printSummary(ctx);
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
