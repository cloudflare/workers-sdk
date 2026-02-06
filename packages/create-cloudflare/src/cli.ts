#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chdir } from "node:process";
import {
	cancel,
	checkMacOSVersion,
	endSection,
	error,
	logRaw,
	startSection,
} from "@cloudflare/cli";
import { CancelError } from "@cloudflare/cli/error";
import { isInteractive } from "@cloudflare/cli/interactive";
import { cliDefinition, parseArgs, processArgument } from "helpers/args";
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
	writeAgentsMd,
} from "./templates";
import { validateProjectDirectory } from "./validators";
import { addTypes } from "./workers";
import { updateWranglerConfig } from "./wrangler/config";
import type { C3Args, C3Context } from "types";

const { npm } = detectPackageManager();

export const main = async (argv: string[]) => {
	const result = await parseArgs(argv);

	if (result.type === "unknown") {
		if (result.showHelpMessage) {
			showHelp(result.args, cliDefinition);
		}

		if (result.errorMessage) {
			// eslint-disable-next-line no-console
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
	printBanner(args);

	checkMacOSVersion({ shouldThrow: true });

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

	if (!ctx.args.experimental) {
		await copyTemplateFiles(ctx);
	}
	updatePackageName(ctx);

	chdir(ctx.project.path);
	await npmInstall(ctx);
	await rectifyPmMismatch(ctx);

	// Offer AGENTS.md for Workers templates that don't use a framework
	// Framework templates may need framework-specific agent guidance
	if (ctx.template.platform === "workers" && !ctx.template.frameworkCli) {
		await offerAgentsMd(ctx);
	}

	endSection(`Application created`);
};

const configure = async (ctx: C3Context) => {
	startSection(
		`Configuring your application for Cloudflare${ctx.args.experimental ? ` via \`wrangler setup\`` : ""}`,
		"Step 2 of 3",
	);

	// This is kept even in the autoconfig case because autoconfig will ultimately end up installing Wrangler anyway
	// If we _didn't_ install Wrangler when using autoconfig we'd end up with a double install (one from `npx` and one from autoconfig)
	await installWrangler();

	if (ctx.args.experimental) {
		const { npx } = detectPackageManager();

		await runCommand([
			npx,
			"wrangler",
			"setup",
			"--yes",
			"--no-completion-message",
			"--no-install-wrangler",
		]);
	} else {
		// Note: This _must_ be called before the configure phase since
		//       pre-existing workers assume its presence in their configure phase
		await updateWranglerConfig(ctx);

		const { template } = ctx;
		if (template.configure) {
			await template.configure({ ...ctx });
		}

		addWranglerToGitIgnore(ctx);

		await updatePackageScripts(ctx);

		await addTypes(ctx);
	}

	// Autoconfig doesn't mess with version control, so C3 runs this after autoconfig
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

const printBanner = (args: Partial<C3Args>) => {
	printWelcomeMessage(version, reporter.isEnabled, args);
	startSection(`Create an application with Cloudflare`, "Step 1 of 3");
};

const offerAgentsMd = async (ctx: C3Context) => {
	ctx.args.agents ??= await processArgument(ctx.args, "agents", {
		type: "confirm",
		question:
			"Do you want to add an AGENTS.md file to help AI coding tools understand Cloudflare APIs?",
		label: "agents",
		defaultValue: C3_DEFAULTS.agents,
	});

	if (!ctx.args.agents) {
		return;
	}

	writeAgentsMd(ctx.project.path);
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

		// ensure we explicitly exit the process, otherwise any ongoing async
		// calls or leftover tasks in the stack queue will keep running until
		// completed
		process.exit();
	});
