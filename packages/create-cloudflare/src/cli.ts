#!/usr/bin/env node
import { mkdirSync } from "fs";
import { dirname } from "path";
import { chdir } from "process";
import {
	cancel,
	endSection,
	error,
	logRaw,
	startSection,
} from "@cloudflare/cli";
import { CancelError } from "@cloudflare/cli/error";
import { isInteractive } from "@cloudflare/cli/interactive";
import { cliDefinition, parseArgs } from "helpers/args";
import { isUpdateAvailable } from "helpers/cli";
import { runCommand } from "helpers/command";
import {
	detectPackageManager,
	rectifyPmMismatch,
} from "helpers/packageManagers";
import { installWrangler, npmInstall } from "helpers/packages";
import { version } from "../package.json";
import { maybeOpenBrowser, offerToDeploy, runDeploy } from "./deploy";
import { printSummary, printWelcomeMessage } from "./dialog";
import { gitCommit, offerGit } from "./git";
import { showHelp } from "./help";
import { reporter, runTelemetryCommand } from "./metrics";
import { createProject } from "./pages";
import {
	addWranglerToGitIgnore,
	copyTemplateFiles,
	createContext,
	updatePackageName,
	updatePackageScripts,
} from "./templates";
import { validateProjectDirectory } from "./validators";
import { installWorkersTypes } from "./workers";
import { updateWranglerToml } from "./wrangler/config";
import type { C3Args, C3Context } from "types";

const { npm } = detectPackageManager();

export const main = async (argv: string[]) => {
	const result = await parseArgs(argv);

	if (result.type === "unknown") {
		if (result.showHelpMessage) {
			showHelp(result.args, cliDefinition);
		}

		if (result.errorMessage) {
			console.error(`\n${result.errorMessage}`);
		}

		if (result.args === null || result.errorMessage) {
			process.exit(1);
		}
		return;
	}

	if (result.type === "telemetry") {
		runTelemetryCommand(result.action);
		return;
	}

	const { args } = result;

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
		await reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			props: {
				args,
			},
			promise: () => runCli(args),
		});
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

	const ctx = await createContext(args);

	await create(ctx);
	await configure(ctx);
	await deploy(ctx);

	printSummary(ctx);
	logRaw("");
};

export const setupProjectDirectory = (ctx: C3Context) => {
	// Crash if the directory already exists
	const path = ctx.project.path;
	const err = validateProjectDirectory(path, ctx.args);
	if (err) {
		throw new Error(err);
	}

	const directory = dirname(path);

	// If the target is a nested directory, create the parent
	mkdirSync(directory, { recursive: true });

	// Change to the parent directory
	chdir(directory);
};

const create = async (ctx: C3Context) => {
	const { template } = ctx;

	setupProjectDirectory(ctx);

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

	await maybeOpenBrowser(ctx);

	endSection("Done");
};

const printBanner = () => {
	printWelcomeMessage(version, reporter.isEnabled);
	startSection(`Create an application with Cloudflare`, "Step 1 of 3");
};

main(process.argv)
	.catch((e) => {
		if (e instanceof CancelError) {
			cancel(e.message);
		} else {
			error(e);
		}
	})
	.finally(async () => {
		await reporter.waitForAllEventsSettled();
	});
