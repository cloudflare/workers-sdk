import * as fs from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import {
	CommandLineArgsError,
	configFileName,
	FatalError,
	parseJSONC,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import * as find from "empathic/find";
import { getNodeCompat } from "miniflare";
import { readConfig } from "../config";
import { createCommand } from "../core/create-command";
import { getEntry } from "../deployment-bundle/entry";
import { logger } from "../logger";
import { formatGeneratedTypes, generateTypes } from "./api";
import { logHorizontalRule } from "./env";
import { checkTypesUpToDate, DEFAULT_WORKERS_TYPES_FILE_NAME } from "./helpers";
import { logRuntimeTypesMessage } from "./runtime/log-runtime-types-message";
import type { Config } from "@cloudflare/workers-utils";

export const typesCommand = createCommand({
	metadata: {
		description: "📝 Generate types from your Worker configuration\n",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		epilogue:
			"📖 Learn more at https://developers.cloudflare.com/workers/languages/typescript/#generate-types",
		category: "Compute & AI",
	},
	behaviour: {
		provideConfig: false,
	},
	positionalArgs: ["path"],
	args: {
		path: {
			describe: "The path to the declaration file for the generated types",
			type: "string",
			default: DEFAULT_WORKERS_TYPES_FILE_NAME,
			demandOption: false,
		},
		"env-interface": {
			type: "string",
			default: "Env",
			describe: "The name of the generated environment interface",
			requiresArg: true,
		},
		"include-runtime": {
			type: "boolean",
			default: true,
			describe: "Include runtime types in the generated types",
		},
		"include-env": {
			type: "boolean",
			default: true,
			describe: "Include Env types in the generated types",
		},
		"strict-vars": {
			type: "boolean",
			default: true,
			describe: "Generate literal and union types for variables",
		},
		"experimental-include-runtime": {
			alias: "x-include-runtime",
			type: "string",
			describe: "The path of the generated runtime types file",
			demandOption: false,
			hidden: true,
			deprecated: true,
		},
		check: {
			demandOption: false,
			describe:
				"Check if the types at the provided path are up to date without regenerating them",
			type: "boolean",
		},
	},
	validateArgs(args) {
		// args.xRuntime will be a string if the user passes "--x-include-runtime" or "--x-include-runtime=..."
		if (typeof args.experimentalIncludeRuntime === "string") {
			throw new CommandLineArgsError(
				"You no longer need to use --experimental-include-runtime.\n" +
					"`wrangler types` will now generate runtime types in the same file as the Env types.\n" +
					"You should delete the old runtime types file, and remove it from your tsconfig.json.\n" +
					"Then rerun `wrangler types`.",
				{ telemetryMessage: true }
			);
		}

		const validInterfaceRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

		if (!validInterfaceRegex.test(args.envInterface)) {
			throw new CommandLineArgsError(
				`The provided env-interface value ("${args.envInterface}") does not satisfy the validation regex: ${validInterfaceRegex}`,
				{
					telemetryMessage:
						"The provided env-interface value does not satisfy the validation regex",
				}
			);
		}

		if (!args.path.endsWith(".d.ts")) {
			throw new CommandLineArgsError(
				`The provided output path '${args.path}' does not point to a declaration file - please use the '.d.ts' extension`,
				{
					telemetryMessage:
						"The provided path does not point to a declaration file",
				}
			);
		}

		validateTypesFile(args.path);

		if (!args.includeEnv && !args.includeRuntime) {
			throw new CommandLineArgsError(
				`You cannot run this command without including either Env or Runtime types`,
				{
					telemetryMessage: true,
				}
			);
		}
	},
	async handler(args) {
		let config: Config;
		const additionalWorkerConfigs = new Array<{ configPath: string }>();
		if (Array.isArray(args.config)) {
			config = readConfig({ ...args, config: args.config[0] });
			for (const configPath of args.config.slice(1)) {
				additionalWorkerConfigs.push({ configPath });
			}
		} else {
			config = readConfig(args);
		}

		const { envInterface, path: outputPath } = args;

		if (
			config.configPath == null ||
			(fs
				.statSync(config.configPath, { throwIfNoEntry: false })
				?.isDirectory() ??
				true)
		) {
			throw new UserError(
				`No config file detected${args.config ? ` (at ${args.config})` : ""}. This command requires a Wrangler configuration file.`,
				{ telemetryMessage: "No config file detected" }
			);
		}

		if (args.check) {
			const outOfDate = await checkTypesUpToDate(config, outputPath);
			if (outOfDate) {
				throw new FatalError(
					`Types at ${outputPath} are out of date. Run \`wrangler types\` to regenerate.`,
					1
				);
			}

			logger.log(`✨ Types at ${outputPath} are up to date.\n`);
			return;
		}

		if (additionalWorkerConfigs.length > 0) {
			for (const additionalConfig of additionalWorkerConfigs) {
				const secondaryConfig = readConfig({
					config: additionalConfig.configPath,
				});
				const serviceEntry = await getEntry({}, secondaryConfig, "types");

				if (serviceEntry.name) {
					logger.log(
						chalk.dim(
							`- Found Worker '${serviceEntry.name}' at '${relative(process.cwd(), serviceEntry.file)}' (${secondaryConfig.configPath})`
						)
					);
				}
			}
		}

		if (args.includeEnv) {
			logger.log(`Generating project types...\n`);
		}

		const typesResult = await generateTypes({
			config,
			environment: args.env,
			envInterface,
			includeEnv: args.includeEnv,
			includeRuntime: args.includeRuntime,
			strictVars: args.strictVars,
			envFile: args.envFile?.[0],
			outputPath,
			additionalWorkerConfigs,
		});

		if (args.includeEnv) {
			if (typesResult.env) {
				// Extract just the type content without the header for logging
				// The header is the first lines starting with /* eslint-disable */ and // Generated by
				const envLines = typesResult.env.split("\n");
				const typeContentStart = envLines.findIndex(
					(line) =>
						!line.startsWith("/* eslint-disable */") &&
						!line.startsWith("// Generated by Wrangler")
				);
				const typeContent =
					typeContentStart > 0
						? envLines.slice(typeContentStart).join("\n")
						: typesResult.env;
				if (typeContent.trim()) {
					logger.log(chalk.dim(typeContent));
				} else {
					logger.log(chalk.dim("No project types to add.\n"));
				}
			} else {
				logger.log(chalk.dim("No project types to add.\n"));
			}
		}

		if (args.includeRuntime) {
			logger.log("Generating runtime types...\n");
			logger.log(chalk.dim("Runtime types generated.\n"));
		}

		logHorizontalRule();

		const configContainsEntrypoint =
			config.main !== undefined || !!config.site?.["entry-point"];
		let entrypointFormat: "modules" | "service-worker" = "modules";
		if (configContainsEntrypoint) {
			try {
				const entrypoint = await getEntry({}, config, "types");
				entrypointFormat = entrypoint?.format ?? "modules";
			} catch {
				entrypointFormat = "modules";
			}
		}

		// Write the output file
		const hasContent = typesResult.env || typesResult.runtime;
		if (hasContent || entrypointFormat === "modules") {
			const output = formatGeneratedTypes(typesResult);
			fs.writeFileSync(outputPath, output, "utf-8");
			logger.log(`✨ Types written to ${outputPath}\n`);
		}

		const tsconfigPath =
			config.tsconfig ?? join(dirname(config.configPath), "tsconfig.json");
		const tsconfigTypes = readTsconfigTypes(tsconfigPath);
		const { mode } = getNodeCompat(
			config.compatibility_date,
			config.compatibility_flags
		);
		if (args.includeRuntime) {
			logRuntimeTypesMessage(tsconfigTypes, mode !== null);
		}

		logger.log(
			`📣 Remember to rerun 'wrangler types' after you change your ${configFileName(config.configPath)} file.\n`
		);
	},
});

/**
 * Checks if a .d.ts file at the given path exists and was not generated by Wrangler.
 *
 * @param path - The path to the .d.ts file to check.
 *
 * @returns void if no conflicting file exists.
 *
 * @throws {Error} If an unexpected error occurs while reading the file.
 * @throws {UserError} If a non-Wrangler .d.ts file already exists at the given path.
 */
const validateTypesFile = (path: string): void => {
	const wranglerOverrideDTSPath = find.file(path);
	if (wranglerOverrideDTSPath === undefined) {
		return;
	}

	try {
		const fileContent = fs.readFileSync(wranglerOverrideDTSPath, "utf8");
		if (
			!fileContent.includes("Generated by Wrangler") &&
			!fileContent.includes("Runtime types generated with workerd")
		) {
			throw new UserError(
				`A non-Wrangler ${basename(path)} already exists, please rename and try again.`,
				{ telemetryMessage: "A non-Wrangler .d.ts file already exists" }
			);
		}
	} catch (error) {
		if (error instanceof Error && !error.message.includes("not found")) {
			throw error;
		}
	}
};

/**
 * Attempts to read the tsconfig.json at the current path.
 *
 * @param tsconfigPath - The path to the tsconfig.json file
 *
 * @returns An array of types defined in the tsconfig.json's compilerOptions.types, or an empty array if not found or on error
 */
function readTsconfigTypes(tsconfigPath: string): string[] {
	if (!fs.existsSync(tsconfigPath)) {
		return [];
	}

	try {
		const tsconfig = parseJSONC(
			fs.readFileSync(tsconfigPath, "utf-8")
		) as TSConfig;
		return tsconfig.compilerOptions?.types || [];
	} catch {
		return [];
	}
}

type TSConfig = {
	compilerOptions: {
		types: string[];
	};
};
