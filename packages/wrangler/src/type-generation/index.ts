import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { findWranglerToml, readConfig } from "../config";
import { getNodeCompatMode } from "../deployment-bundle/node-compat";
import { CommandLineArgsError } from "../index";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { checkTypes } from "./check-types";
import { generateEnvTypes } from "./env/generate-env-types";
import { readTsconfigTypes } from "./helpers";
import {
	DEFAULT_OUTFILE_RELATIVE_PATH,
	generateRuntimeTypes,
} from "./runtime/generate-runtime-types";
import { logRuntimeTypesMessage } from "./runtime/log-runtime-types-message";
import { validateTsConfig } from "./runtime/validate-ts-config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function typesOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("path", {
			describe: "The path to the declaration file to generate",
			type: "string",
			default: "worker-configuration.d.ts",
			demandOption: false,
		})
		.check(({ path }) => {
			if (path && !path.endsWith(".d.ts")) {
				throw new CommandLineArgsError(
					`The provided path value ("${path}") does not point to a declaration file (please use the 'd.ts' extension)`
				);
			}

			return true;
		})
		.option("env-interface", {
			type: "string",
			default: "Env",
			describe: "The name of the generated environment interface",
			requiresArg: true,
		})
		.check((args) => {
			if (!args["env-interface"]) {
				return true;
			}

			const validInterfaceRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

			if (!validInterfaceRegex.test(args["env-interface"])) {
				throw new CommandLineArgsError(
					`The provided env-interface value ("${args["env-interface"]}") does not satisfy the validation regex: ${validInterfaceRegex}`
				);
			}

			return true;
		})
		.option("experimental-runtime", {
			alias: ["x-runtime", "experimental-include-runtime", "x-include-runtime"],
			type: "string",
			describe: "The path of the generated runtime types file",
			demandOption: false,
			coerce: (value) => {
				if (value === undefined) {
					return null;
				}

				if (value === "") {
					return DEFAULT_OUTFILE_RELATIVE_PATH;
				}

				return value;
			},
		})
		.option("experimental-check", {
			alias: "x-check",
			default: false,
			type: "boolean",
		});
}

export async function typesHandler(
	args: StrictYargsOptionsToInterface<typeof typesOptions>
) {
	const {
		envInterface,
		experimentalJsonConfig,
		experimentalRuntime: runtimeTypesPath,
		path: outputPath,
	} = args;
	const configPath =
		args.config ?? findWranglerToml(process.cwd(), experimentalJsonConfig);

	if (
		!configPath ||
		!fs.existsSync(configPath) ||
		fs.statSync(configPath).isDirectory()
	) {
		logger.warn(
			`No config file detected${
				args.config ? ` (at ${args.config})` : ""
			}, aborting`
		);
		return;
	}

	const config = readConfig(configPath, args);
	const tsconfig =
		config.tsconfig ?? join(dirname(configPath), "tsconfig.json");

	await printWranglerBanner();

	if (runtimeTypesPath) {
		logger.log(`Generating runtime types...`);

		const { outFile } = await generateRuntimeTypes({
			config,
			outFile: runtimeTypesPath || undefined,
		});

		const tsconfigTypes = readTsconfigTypes(tsconfig);
		const { mode } = getNodeCompatMode(config);

		logRuntimeTypesMessage(outFile, tsconfigTypes, mode !== null);
	}

	await generateEnvTypes(
		config,
		envInterface,
		configPath,
		outputPath,
		args.env
	);

	if (args.experimentalCheck) {
		if (runtimeTypesPath) {
			validateTsConfig({
				runtimeTypesPath,
				tsconfig,
			});
		}

		await checkTypes(tsconfig);
	}
}
