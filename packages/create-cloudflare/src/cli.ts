#!/usr/bin/env node
import Haikunator from "haikunator";
import { crash, logRaw, startSection } from "helpers/cli";
import { dim, brandColor } from "helpers/colors";
import { selectInput, textInput } from "helpers/interactive";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { version } from "../package.json";
import { validateProjectDirectory } from "./common";
import { runPagesGenerator } from "./pages";
import { runWorkersGenerator } from "./workers";
import type { Option } from "helpers/interactive";
import type { PagesGeneratorArgs } from "types";

export const main = async (argv: string[]) => {
	printBanner();

	const args = await parseArgs(argv);

	const validatedArgs: PagesGeneratorArgs = {
		...args,
		projectName: await validateName(args.projectName, {
			acceptDefault: args.wranglerDefaults,
		}),
		type: await validateType(args.type, {
			acceptDefault: args.wranglerDefaults,
		}),
	};

	const { handler } = templateMap[validatedArgs.type];
	await handler(validatedArgs);
};

const printBanner = () => {
	logRaw(dim(`\nusing create-cloudflare version ${version}\n`));
	startSection(`Create an application with Cloudflare`, "Step 1 of 3");
};

const parseArgs = async (argv: string[]) => {
	const args = await yargs(hideBin(argv))
		.scriptName("create-cloudflare")
		.usage("$0 [args]")
		.positional("name", { type: "string" })
		.option("type", { type: "string" })
		.option("framework", { type: "string" })
		.option("deploy", { type: "boolean" })
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
		.option("wrangler-defaults", { type: "boolean", hidden: true })
		.help().argv;

	return {
		projectName: args._[0] as string | undefined,
		...args,
	};
};

const validateName = async (
	name: string | undefined,
	{ acceptDefault = false } = {}
): Promise<string> => {
	return textInput({
		question: `Where do you want to create your application?`,
		helpText: "also used as application name",
		renderSubmitted: (value: string) => {
			return `${brandColor("dir")} ${dim(value)}`;
		},
		defaultValue: name ?? new Haikunator().haikunate({ tokenHex: true }),
		acceptDefault,
		validate: validateProjectDirectory,
	});
};

const validateType = async (
	type: string | undefined,
	{ acceptDefault = false } = {}
) => {
	const templateOptions = Object.entries(templateMap)
		.filter(([_, { hidden }]) => !hidden)
		.map(([value, { label }]) => ({ value, label }));

	type = await selectInput({
		question: "What type of application do you want to create?",
		options: templateOptions,
		renderSubmitted: (option: Option) => {
			return `${brandColor("type")} ${dim(option.label)}`;
		},
		defaultValue: type ?? "hello-world",
		acceptDefault,
	});

	if (!type || !Object.keys(templateMap).includes(type)) {
		crash("An application type must be specified to continue.");
	}

	return type;
};

type TemplateConfig = {
	label: string;
	handler: (args: PagesGeneratorArgs) => Promise<void>;
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
