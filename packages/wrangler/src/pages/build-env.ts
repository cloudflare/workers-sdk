import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configFileName, findWranglerConfig, readConfig } from "../config";
import { FatalError } from "../errors";
import { logger } from "../logger";
import {
	EXIT_CODE_INVALID_PAGES_CONFIG,
	EXIT_CODE_NO_CONFIG_FOUND,
} from "./errors";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export type PagesBuildEnvArgs = StrictYargsOptionsToInterface<typeof Options>;

export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("projectDir", {
			type: "string",
			description: "The location of the Pages project",
		})
		.options({
			outfile: {
				type: "string",
				description: "The location to write the build environment file",
			},
		});
}

export const Handler = async (args: PagesBuildEnvArgs) => {
	if (!args.projectDir) {
		throw new FatalError("No Pages project location specified");
	}
	if (!args.outfile) {
		throw new FatalError("No outfile specified");
	}

	logger.log(
		"Checking for configuration in a Wrangler configuration file (BETA)\n"
	);

	const configPath = findWranglerConfig(args.projectDir);
	if (!configPath || !existsSync(configPath)) {
		logger.debug("No Wrangler configuration file found. Exiting.");
		process.exitCode = EXIT_CODE_NO_CONFIG_FOUND;
		return;
	}

	logger.log(
		`Found ${configFileName(configPath)} file. Reading build configuration...`
	);

	let config: Omit<Config, "pages_build_output_dir"> & {
		pages_build_output_dir: string;
	};
	try {
		config = readConfig(
			configPath,
			{
				...args,
				// eslint-disable-next-line turbo/no-undeclared-env-vars
				env: process.env.PAGES_ENVIRONMENT,
			},
			true
		);
	} catch (err) {
		// found `wrangler.toml` but `pages_build_output_dir` is not specififed
		if (
			err instanceof FatalError &&
			err.code === EXIT_CODE_INVALID_PAGES_CONFIG
		) {
			logger.debug(
				`Your ${configFileName(configPath)} file is invalid. Exiting.`
			);
			process.exitCode = EXIT_CODE_INVALID_PAGES_CONFIG;
			return;
		}

		// found `wrangler.toml` with `pages_build_output_dir` specified, but
		// file contains invalid configuration
		throw err;
	}

	// Ensure JSON variables are not included
	const textVars = Object.fromEntries(
		Object.entries(config.vars).filter(([_, v]) => typeof v === "string")
	);

	const buildConfiguration = {
		vars: textVars,
		pages_build_output_dir: path.relative(
			args.projectDir,
			config.pages_build_output_dir
		),
	};

	writeFileSync(args.outfile, JSON.stringify(buildConfiguration));
	logger.debug(`Build configuration written to ${args.outfile}`);
	logger.debug(JSON.stringify(buildConfiguration), null, 2);
	const vars = Object.entries(buildConfiguration.vars);
	const message = [
		`Build environment variables: ${vars.length === 0 ? "(none found)" : ""}`,
		...vars.map(([key, value]) => `  - ${key}: ${value}`),
	].join("\n");

	logger.log(
		`pages_build_output_dir: ${buildConfiguration.pages_build_output_dir}`
	);

	logger.log(message);
};
