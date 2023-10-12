import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { version } from "../../package.json";
import { templateMap } from "../templateMap";
import { C3_DEFAULTS, WRANGLER_DEFAULTS, logRaw } from "./cli";
import { getRenderers, inputPrompt } from "./interactive";
import type { PromptConfig } from "./interactive";
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
		.option("accept-defaults", {
			alias: "y",
			type: "boolean",
		})
		.option("auto-update", {
			type: "boolean",
			default: C3_DEFAULTS.autoUpdate,
			description:
				"Automatically uses the latest version of `create-cloudflare`. Set --no-auto-update to disable",
		})
		.option("wrangler-defaults", { type: "boolean", hidden: true })
		.version(version)
		// note: we use strictOptions since `strict()` seems not to handle `positional`s correctly
		.strictOptions()
		.alias("h", "help")
		.help();

	const args = await yargsObj.argv;

	const positionalArgs = args._;

	// since `yargs.strict()` can't check the `positional`s for us we need to do it manually ourselves
	if (positionalArgs.length > 1) {
		yargsObj.showHelp();
		console.error("\nToo many positional arguments provided");
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

export const processArgument = async <T>(
	args: Partial<C3Args>,
	name: keyof C3Args,
	promptConfig: PromptConfig
) => {
	let value = args[name];
	const renderSubmitted = getRenderers(promptConfig).submit;

	// If the value has already been set via args, use that
	if (value !== undefined) {
		promptConfig.validate?.(value);

		const lines = renderSubmitted({ value });
		logRaw(lines.join("\n"));

		return value as T;
	}

	value = await inputPrompt(promptConfig);

	return value as T;
};
