#!/usr/bin/env node
import { crash, logRaw, startSection } from "@cloudflare/cli";
import { blue, dim } from "@cloudflare/cli/colors";
import {
	isInteractive,
	spinner,
	spinnerFrames,
} from "@cloudflare/cli/interactive";
import { parseArgs, processArgument } from "helpers/args";
import { C3_DEFAULTS } from "helpers/cli";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packages";
import semver from "semver";
import { version } from "../package.json";
import { validateProjectDirectory } from "./common";
import * as shellquote from "./helpers/shell-quote";
import { templateMap } from "./templateMap";
import type { C3Args } from "types";

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
		`npm info create-cloudflare@latest dist-tags.latest`,
		{ silent: true, useSpinner: false }
	);
	s.stop();

	// Don't auto-update to major versions
	if (semver.diff(latestVersion, version) === "major") return false;

	return semver.gt(latestVersion, version);
};

// Spawn a separate process running the most recent version of c3
export const runLatest = async () => {
	const args = process.argv.slice(2);

	// the parsing logic of `npm create` requires `--` to be supplied
	// before any flags intended for the target command.
	const argString =
		npm === "npm"
			? `-- ${shellquote.quote(args)}`
			: `${shellquote.quote(args)}`;

	await runCommand(`${npm} create cloudflare@latest ${argString}`);
};

// Entrypoint to c3
export const runCli = async (args: Partial<C3Args>) => {
	printBanner();

	const defaultName = args.existingScript
		? args.existingScript
		: C3_DEFAULTS.projectName;

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

	// If not specified, attempt to infer the `type` argument from other flags
	if (!args.type) {
		if (args.framework) {
			args.type = "webFramework";
		} else if (args.existingScript) {
			args.type = "pre-existing";
		}
	}

	const templateOptions = Object.entries(templateMap).map(
		([value, { label, hidden }]) => ({ value, label, hidden })
	);

	const type = await processArgument<string>(args, "type", {
		type: "select",
		question: "What type of application do you want to create?",
		label: "type",
		options: templateOptions,
		defaultValue: C3_DEFAULTS.type,
	});

	if (!type) {
		return crash("An application type must be specified to continue.");
	}

	if (!Object.keys(templateMap).includes(type)) {
		return crash(`Unknown application type provided: ${type}.`);
	}

	const validatedArgs: C3Args = {
		...args,
		type,
		projectName,
	};

	const { handler } = templateMap[type];
	await handler(validatedArgs);
};

const printBanner = () => {
	logRaw(dim(`using create-cloudflare version ${version}\n`));
	startSection(`Create an application with Cloudflare`, "Step 1 of 3");
};

main(process.argv).catch((e) => crash(e));
