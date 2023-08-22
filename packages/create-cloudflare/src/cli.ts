#!/usr/bin/env node
import Haikunator from "haikunator";
import { crash, logRaw, startSection } from "helpers/cli";
import { dim } from "helpers/colors";
import { runCommand } from "helpers/command";
import { processArgument, spinner, spinnerFrames } from "helpers/interactive";
import semver from "semver";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { version } from "../package.json";
import { validateProjectDirectory } from "./common";
import { runPagesGenerator } from "./pages";
import { runWorkersGenerator } from "./workers";
import type { C3Args } from "types";

export const C3_DEFAULTS = {
	projectName: new Haikunator().haikunate({ tokenHex: true }),
	type: "hello-world",
	framework: "angular",
	autoUpdate: true,
	deploy: true,
	git: true,
	open: true,
	ts: true,
};

const WRANGLER_DEFAULTS = {
	...C3_DEFAULTS,
	deploy: false,
};

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

const isUpdateAvailable = async () => {
	if (process.env.VITEST) {
		return false;
	}

	// Use a spinner when running this check since it may take some time
	const s = spinner(spinnerFrames.vertical);
	s.start("Checking for newer version");
	const latestVersion = await runCommand(
		`npm info create-cloudflare@latest dist-tags.latest`,
		{ silent: true, useSpinner: false }
	);
	s.stop();

	return semver.gt(latestVersion, version);
};

export const runLatest = async () => {
	const args = process.argv.slice(2);
	await runCommand(`npm create cloudflare@latest ${args.join(" ")}`);
};

export const runCli = async (args: Partial<C3Args>) => {
	printBanner();

	const projectName = await processArgument<string>(args, "projectName", {
		type: "text",
		question: `In which directory do you want to create your application?`,
		helpText: "also used as application name",
		defaultValue: C3_DEFAULTS.projectName,
		label: "dir",
		validate: (value) =>
			validateProjectDirectory(String(value) || C3_DEFAULTS.projectName),
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

	const templateOptions = Object.entries(templateMap)
		.filter(([_, { hidden }]) => !hidden)
		.map(([value, { label }]) => ({ value, label }));

	const type = await processArgument<string>(args, "type", {
		type: "select",
		question: "What type of application do you want to create?",
		label: "type",
		options: templateOptions,
		defaultValue: C3_DEFAULTS.type,
	});

	if (!type || !Object.keys(templateMap).includes(type)) {
		return crash("An application type must be specified to continue.");
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

export const parseArgs = async (argv: string[]): Promise<Partial<C3Args>> => {
	const args = await yargs(hideBin(argv))
		.scriptName("create-cloudflare")
		.usage("$0 [args]")
		.positional("name", { type: "string" })
		.option("type", { type: "string" })
		.option("framework", { type: "string" })
		.option("deploy", { type: "boolean" })
		.option("auto-update", { type: "boolean", default: C3_DEFAULTS.autoUpdate })
		.option("ts", { type: "boolean" })
		.option("git", { type: "boolean" })
		.option("open", {
			type: "boolean",
			default: true,
			description:
				"opens your browser after your deployment, set --no-open to disable",
		})
		.option("existing-script", {
			type: "string",
			hidden: templateMap["pre-existing"].hidden,
		})
		.option("accept-defaults", {
			alias: "y",
			type: "boolean",
		})
		.option("wrangler-defaults", { type: "boolean", hidden: true })
		.version(version)
		.help().argv;

	return {
		...(args.wranglerDefaults && WRANGLER_DEFAULTS),
		...(args.acceptDefaults && C3_DEFAULTS),
		projectName: args._[0] as string | undefined,
		...args,
	};
};

type TemplateConfig = {
	label: string;
	handler: (args: C3Args) => Promise<void>;
	hidden?: boolean;
};

const templateMap: Record<string, TemplateConfig> = {
	webFramework: {
		label: "Website or web app",
		handler: runPagesGenerator,
	},
	"hello-world": {
		label: `"Hello World" Worker`,
		handler: runWorkersGenerator,
	},
	common: {
		label: "Example router & proxy Worker",
		handler: runWorkersGenerator,
	},
	scheduled: {
		label: "Scheduled Worker (Cron Trigger)",
		handler: runWorkersGenerator,
	},
	queues: {
		label: "Queue consumer & producer Worker",
		handler: runWorkersGenerator,
	},
	chatgptPlugin: {
		label: `ChatGPT plugin`,
		handler: (args) =>
			runWorkersGenerator({
				...args,
				ts: true,
			}),
	},
	"pre-existing": {
		label: "Pre-existing Worker (from Dashboard)",
		handler: runWorkersGenerator,
		hidden: true,
	},
};

main(process.argv).catch((e) => crash(e));
