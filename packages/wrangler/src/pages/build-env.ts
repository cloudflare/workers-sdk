import { existsSync } from "node:fs";
import path from "node:path";
import { readConfig } from "../config";
import { FatalError } from "../errors";
import { logger } from "../logger";
import { EXIT_CODE_NO_CONFIG_FOUND } from "./errors";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export type PagesBuildEnvArgs = StrictYargsOptionsToInterface<typeof Options>;

export function Options(yargs: CommonYargsArgv) {
	return yargs.positional("projectDir", {
		type: "string",
		description: "The location of the Pages project",
	});
}

export const Handler = async (args: PagesBuildEnvArgs) => {
	if (!args.projectDir) {
		throw new FatalError("No Pages project location specified");
	}
	const configPath = path.resolve(args.projectDir, "wrangler.toml");
	// Fail early if the config file doesn't exist
	if (!existsSync(configPath)) {
		throw new FatalError(
			"No Pages config file found",
			EXIT_CODE_NO_CONFIG_FOUND
		);
	}

	const config = readConfig(
		path.resolve(args.projectDir, "wrangler.toml"),
		{
			...args,
			// eslint-disable-next-line turbo/no-undeclared-env-vars
			env: process.env.PAGES_ENVIRONMENT,
		},
		true
	);

	// Ensure JSON variables are not included
	const textVars = Object.fromEntries(
		Object.entries(config.vars).filter(([_, v]) => typeof v === "string")
	);

	logger.log(
		JSON.stringify({
			vars: textVars,
			pages_build_output_dir: path.relative(
				args.projectDir,
				config.pages_build_output_dir
			),
		})
	);
};
