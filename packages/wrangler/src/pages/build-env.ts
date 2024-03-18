import { readConfig } from "../config";
import { FatalError } from "../errors";
import { logger } from "../logger";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export type PagesBuildEnvArgs = StrictYargsOptionsToInterface<typeof Options>;

export function Options(yargs: CommonYargsArgv) {
	return yargs;
}

export const Handler = async (args: PagesBuildEnvArgs) => {
	const config = readConfig(undefined, {
		...args,
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		env: process.env.PAGES_ENVIRONMENT,
	});
	if (!config.pages_build_output_dir) {
		throw new FatalError("No Pages config file found");
	}

	// Ensure JSON variables are not included
	const textVars = Object.fromEntries(
		Object.entries(config.vars).filter(([_, v]) => typeof v === "string")
	);

	logger.log(JSON.stringify(textVars));
};
