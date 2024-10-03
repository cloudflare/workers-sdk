import { inputPrompt } from "@cloudflare/cli/interactive";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { version } from "../../package.json";
import { reporter } from "../metrics";
import {
	getFrameworkMap,
	getNamesAndDescriptions,
	getTemplateMap,
} from "../templates";
import { C3_DEFAULTS, WRANGLER_DEFAULTS } from "./cli";
import type { PromptConfig } from "@cloudflare/cli/interactive";
import type { C3Args } from "types";
import type { Argv } from "yargs";

export type ArgDefinition = {
	name: string;
	type: "string" | "boolean";
	description: string;
	default?: boolean | string;
	hidden?: boolean;
	requiresArg?: boolean;
};

export type OptionDefinition = {
	alias?: string;
	footer?: string;
	values?:
		| AllowedValueDefinition[]
		| ((args: Partial<C3Args> | null) => AllowedValueDefinition[]);
} & ArgDefinition;

export type AllowedValueDefinition = {
	name: string;
	description?: string;
};

export type ArgumentsDefinition = {
	intro: string;
	positionals?: ArgDefinition[];
	options: OptionDefinition[];
};

export const cliDefinition: ArgumentsDefinition = {
	intro: `
    The create-cloudflare cli (also known as C3) is a command-line tool designed to help you set up and deploy new applications to Cloudflare. In addition to speed, it leverages officially developed templates for Workers and framework-specific setup guides to ensure each new application that you set up follows Cloudflare and any third-party best practices for deployment on the Cloudflare network.
  `,
	positionals: [
		{
			name: "directory",
			type: "string",
			description: `The directory where the application should be created. Also used as the name of the application.

        If a path is provided that includes intermediary directories, only the base name will be used as the name of the application.`,
		},
	],
	options: [
		{
			name: "experimental",
			hidden: true,
			type: "boolean",
			description: "Select from experimental frameworks.",
			default: false,
		},
		{
			name: "category",
			type: "string",
			description: `Specifies the kind of templates that should be created`,
			values(args) {
				const experimental = Boolean(args?.["experimental"]);
				if (experimental) {
					return [
						{ name: "hello-world", description: "Hello World example" },
						{ name: "web-framework", description: "Framework Starter" },
					];
				} else {
					return [
						{ name: "hello-world", description: "Hello World example" },
						{ name: "web-framework", description: "Framework Starter" },
						{ name: "demo", description: "Application Starter" },
						{
							name: "remote-template",
							description: "Template from a GitHub repo",
						},
					];
				}
			},
		},
		{
			name: "type",
			alias: "t",
			type: "string",
			requiresArg: true,
			description: `
        When using a built-in template, specifies the type of application that should be created.

        Note that "--category" and "--template" are mutually exclusive options. If both are provided, "--category" will be used.
        `,
			values(args) {
				const experimental = Boolean(args?.["experimental"]);
				if (experimental) {
					return getNamesAndDescriptions(getTemplateMap({ experimental }));
				} else {
					return [
						{
							name: "hello-world",
							description: "A basic “Hello World” Cloudflare Worker.",
						},
						{
							name: "hello-world-durable-object",
							description:
								"A basic “Hello World” Cloudflare Worker with a Durable Worker.",
						},
						{
							name: "common",
							description:
								"A Cloudflare Worker which implements a common example of routing/proxying functionalities.",
						},
						{
							name: "scheduled",
							description:
								"A scheduled Cloudflare Worker (triggered via Cron Triggers).",
						},
						{
							name: "queues",
							description:
								"A Cloudflare Worker which is both a consumer and produced of Queues.",
						},
						{
							name: "openapi",
							description: "A Worker implementing an OpenAPI REST endpoint.",
						},
						{
							name: "pre-existing",
							description:
								"Fetch a Worker initialized from the Cloudflare dashboard.",
						},
					];
				}
			},
		},
		{
			name: "framework",
			alias: "f",
			type: "string",
			requiresArg: true,
			description: `The type of framework to use to create a web application (when using this option "--category" is coerced to "web-framework")

      When using the --framework option, C3 will dispatch to the official creation tool used by the framework (ex. "create-remix" is used for Remix).

      You may specify additional arguments to be passed directly to these underlying tools by adding them after a "--" argument, like so:

      npm create cloudflare -- --framework next -- --ts
      pnpm create clouldfare --framework next -- --ts
      `,
			values: (args) =>
				getNamesAndDescriptions(
					getFrameworkMap({
						experimental: Boolean(args?.["experimental"]),
					}),
				),
		},
		{
			name: "lang",
			type: "string",
			description: `The programming language of the template`,
			values: [{ name: "ts" }, { name: "js" }, { name: "python" }],
		},
		{
			name: "deploy",
			type: "boolean",
			description: "Deploy your application after it has been created",
		},
		{
			name: "ts",
			type: "boolean",
			description: "Use TypeScript in your application",
			hidden: true,
		},
		{
			name: "git",
			type: "boolean",
			description: "Initialize a local git repository for your application",
		},
		{
			name: "open",
			type: "boolean",
			default: true,
			description:
				"Opens the deployed application in your browser (this option is ignored if the application is not deployed)",
		},
		{
			name: "existing-script",
			description: `The name of an existing Cloudflare Workers script to clone locally (when using this option "--type" is coerced to "pre-existing").

        When "--existing-script" is specified, "deploy" will be ignored.
        `,
			type: "string",
			requiresArg: true,
		},
		{
			name: "template",
			type: "string",
			requiresArg: true,
			description: `An external template to be used when creating your project.

        Any "degit" compatible string may be specified. For example:

        npm create cloudflare my-project -- --template github:user/repo
        npm create cloudflare my-project -- --template git@github.com:user/repo
        npm create cloudflare my-project -- --template https://github.com/user/repo
        npm create cloudflare my-project -- --template git@github.com:user/repo#dev (branch)
        npm create cloudflare my-project -- --template git@github.com:user/repo#v1.2.3 (tag)
        npm create cloudflare my-project -- --template git@github.com:user/repo#1234abcd (commit)

        Note that subdirectories may also be used. For example:

        npm create cloudflare -- --template https://github.com/cloudflare/workers-sdk/templates/worker-r2
        `,
		},
		{
			name: "accept-defaults",
			alias: "y",
			type: "boolean",
			description:
				"Use all the default C3 options (each can also be overridden by specifying it)",
		},
		{
			name: "auto-update",
			type: "boolean",
			default: C3_DEFAULTS.autoUpdate,
			description: "Automatically uses the latest version of C3",
		},
		{
			name: "wrangler-defaults",
			description: "Use special defaults for `wrangler init`",
			type: "boolean",
			hidden: true,
		},
		{
			name: "help",
			alias: "h",
			description: "Show help and exit",
			type: "boolean",
			hidden: true,
		},
	],
};

export const parseArgs = async (
	argv: string[],
): Promise<
	| {
			type: "default";
			args: Partial<C3Args>;
	  }
	| {
			type: "telemetry";
			action: "enable" | "disable" | "status";
	  }
	| {
			type: "unknown";
			args: Partial<C3Args> | null;
			showHelpMessage?: boolean;
			errorMessage?: string;
	  }
> => {
	const doubleDashesIdx = argv.indexOf("--");
	const c3Args = argv.slice(
		0,
		doubleDashesIdx < 0 ? undefined : doubleDashesIdx,
	);
	const additionalArgs =
		doubleDashesIdx < 0 ? [] : argv.slice(doubleDashesIdx + 1);

	const c3positionalArgs = c3Args.filter((arg) => !arg.startsWith("-"));

	if (
		c3positionalArgs[2] === "telemetry" &&
		c3positionalArgs[3] !== undefined
	) {
		const action = c3positionalArgs[3];

		switch (action) {
			case "enable":
			case "disable":
			case "status":
				return {
					type: "telemetry",
					action,
				};
			default:
				throw new Error(`Unknown subcommand "telemetry ${action}"`);
		}
	}

	const yargsObj = yargs(hideBin(c3Args))
		.scriptName("create-cloudflare")
		.usage("$0 [args]")
		.version(version)
		.alias("v", "version")
		.help(false) as unknown as Argv<Partial<C3Args>>;

	const { positionals, options } = cliDefinition;
	if (positionals) {
		for (const { name, ...props } of positionals) {
			yargsObj.positional<typeof name, typeof props>(name, props);
		}
	}

	if (options) {
		for (const { name, alias, ...props } of options) {
			yargsObj.option(name, props);
			if (alias) {
				yargsObj.alias(alias, name);
			}
		}
	}

	let args: Awaited<(typeof yargsObj)["argv"]> | null = null;

	try {
		args = await yargsObj.argv;
	} catch {}

	if (args === null) {
		return {
			type: "unknown",
			args,
		};
	}

	if (args.version || args.help) {
		return {
			type: "unknown",
			showHelpMessage: args.help,
			args,
		};
	}

	const positionalArgs = args._;

	for (const opt in args) {
		if (!validOption(opt)) {
			return {
				type: "unknown",
				showHelpMessage: true,
				args,
				errorMessage: `Unrecognized option: ${opt}`,
			};
		}
	}

	// since `yargs.strict()` can't check the `positional`s for us we need to do it manually ourselves
	if (positionalArgs.length > 1) {
		return {
			type: "unknown",
			showHelpMessage: true,
			args,
			errorMessage: "Too many positional arguments provided",
		};
	}

	return {
		type: "default",
		args: {
			...(args.wranglerDefaults && WRANGLER_DEFAULTS),
			...(args.acceptDefaults && C3_DEFAULTS),
			...args,
			additionalArgs,
			projectName: positionalArgs[0] as string | undefined,
		},
	};
};

let optionKeys: string[];
const validOption = (opt: string) => {
	// Skip positionals
	if (opt === "_" || opt === "$0") {
		return true;
	}

	if (!optionKeys) {
		optionKeys = cliDefinition.options.reduce<string[]>((acc, val) => {
			return [
				...acc,
				val.name,
				// Camel cased version of the key
				camelize(val.name),
				// Alias, if it exists
				...(val.alias ? [val.alias] : []),
			];
		}, []);
	}

	return optionKeys.includes(opt);
};

const camelize = (str: string) => str.replace(/-./g, (x) => x[1].toUpperCase());

export const processArgument = async <Key extends keyof C3Args>(
	args: Partial<C3Args>,
	key: Key,
	promptConfig: PromptConfig,
) => {
	return await reporter.collectAsyncMetrics({
		eventPrefix: "c3 prompt",
		props: {
			args,
			key,
			promptConfig,
		},
		// Skip metrics collection if the arg value is already set
		// This can happen when the arg is set via the CLI or if the user has already answered the prompt previously
		disableTelemetry: args[key] !== undefined,
		async promise() {
			const value = args[key];
			const result = await inputPrompt<Required<C3Args>[Key]>({
				...promptConfig,
				// Accept the default value if the arg is already set
				acceptDefault: promptConfig.acceptDefault ?? value !== undefined,
				defaultValue: value ?? promptConfig.defaultValue,
				throwOnError: true,
			});

			// Update value in args before returning the result
			args[key] = result;

			// Set properties for prompt completed event
			reporter.setEventProperty("answer", result);
			reporter.setEventProperty("isDefaultValue", result === C3_DEFAULTS[key]);

			return result;
		},
	});
};
