import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { version } from "../../package.json";
import { C3_DEFAULTS, WRANGLER_DEFAULTS } from "./cli";
import type { C3Args } from "types";

export const parseArgs = async (argv: string[]): Promise<Partial<C3Args>> => {
	const doubleDashesIdx = argv.indexOf("--");
	const c3Args = argv.slice(
		0,
		doubleDashesIdx < 0 ? undefined : doubleDashesIdx
	);
	const additionalArgs =
		doubleDashesIdx < 0 ? [] : argv.slice(doubleDashesIdx + 1);

	const yargsObj = yargs(hideBin(c3Args))
		.scriptName("create-cloudflare")
		.usage("$0 [args]")
		.positional("directory", {
			type: "string",
			description:
				"The directory where the application should be created. The name of the application is taken from the directory name",
		})
		.option("type", {
			type: "string",
			requiresArg: true,
			description: "The type of application that should be created",
		})
		.option("framework", {
			type: "string",
			requiresArg: true,
			description:
				"The type of framework to use to create a web application (when using this option `--type` is ignored)",
		})
		.option("deploy", {
			type: "boolean",
			description: "Deploy your application after it has been created",
		})
		.option("ts", {
			type: "boolean",
			description: "Use TypeScript in your application",
		})
		.option("git", {
			type: "boolean",
			description: "Initialize a local git repository for your application",
		})
		.option("open", {
			type: "boolean",
			default: true,
			description:
				"Opens the deployed application in your browser (this option is ignored if the application is not deployed)",
		})
		.option("existing-script", {
			type: "string",
			requiresArg: true,
			hidden: true,
		})
		.option("template", {
			type: "string",
			requiresArg: true,
			description:
				"A degit compatible string or the url to a git repository (with optionally a directory path) containing the C3 template to use",
		})
		.option("accept-defaults", {
			alias: "y",
			type: "boolean",
			description:
				"Use all the default C3 options (each can also be overridden by specifying it)",
		})
		.option("auto-update", {
			type: "boolean",
			default: C3_DEFAULTS.autoUpdate,
			description: "Automatically uses the latest version of C3",
		})
		.option("wrangler-defaults", { type: "boolean", hidden: true })
		.version(version)
		.alias("v", "version")
		// note: we use strictOptions since `strict()` seems not to handle `positional`s correctly
		.strictOptions()
		// we want to include a note in our help message pointing people to the cloudflare C3 docs, yargs doesn't
		// allow us to simply append to its help message so we need to prevent yargs from process.exiting so that
		// we can show the extra note and exit manually
		.exitProcess(false)
		.alias("h", "help")
		.help();

	let args: Awaited<typeof yargsObj["argv"]> | null = null;

	try {
		args = await yargsObj.argv;
	} catch {}

	if (args === null) {
		showMoreInfoNote();
		process.exit(1);
	}

	if (args.version) {
		process.exit(0);
	}

	if (args.help) {
		showMoreInfoNote();
		process.exit(0);
	}

	const positionalArgs = args._;

	// since `yargs.strict()` can't check the `positional`s for us we need to do it manually ourselves
	if (positionalArgs.length > 1) {
		yargsObj.showHelp();
		console.error("\nToo many positional arguments provided");
		showMoreInfoNote();
		process.exit(1);
	}

	return {
		...(args.wranglerDefaults && WRANGLER_DEFAULTS),
		...(args.acceptDefaults && C3_DEFAULTS),
		projectName: positionalArgs[0] as string | undefined,
		additionalArgs,
		...args,
	};
};

const showMoreInfoNote = () => {
	const c3CliArgsDocsPage =
		"https://developers.cloudflare.com/pages/get-started/c3/#cli-arguments";
	console.error(
		`\nFor more information regarding how to invoke C3 please visit ${c3CliArgsDocsPage}`
	);
};
