import chalk from "chalk";
import { fetchResult } from "../cfetch";
import { experimental_readRawConfig, readConfig } from "../config";
import { defaultWranglerConfig } from "../config/config";
import { FatalError, UserError } from "../errors";
import { run } from "../experimental-flags";
import { logger } from "../logger";
import { dedent } from "../utils/dedent";
import { isLocal, printResourceLocation } from "../utils/is-local";
import { printWranglerBanner } from "../wrangler-banner";
import { demandSingleValue } from "./helpers";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";
import type {
	CommandDefinition,
	HandlerArgs,
	InternalDefinition,
	NamedArgDefinitions,
} from "./types";
import type { PositionalOptions } from "yargs";

/**
 * Creates a function for registering commands using Yargs.
 */
export function createRegisterYargsCommand(
	yargs: CommonYargsArgv,
	subHelp: SubHelp
) {
	return function registerCommand(
		segment: string,
		def: InternalDefinition,
		registerSubTreeCallback: () => void
	): void {
		yargs.command(
			segment,
			(def.metadata?.hidden ? false : def.metadata?.description) as string, // Cast to satisfy TypeScript overload selection
			(subYargs) => {
				if (def.type === "command") {
					const args = def.args ?? {};

					const positionalArgs = new Set(def.positionalArgs);

					const nonPositional = Object.fromEntries(
						Object.entries(args)
							.filter(([key]) => !positionalArgs.has(key))
							.map(([name, opts]) => [
								name,
								{
									...opts,
									group: "group" in opts ? chalk.bold(opts.group) : undefined,
								},
							])
					);

					subYargs
						.options(nonPositional)
						.epilogue(def.metadata?.epilogue ?? "")
						.example(
							def.metadata.examples?.map((ex) => [
								ex.command,
								ex.description,
							]) ?? []
						);

					for (const hide of def.metadata.hideGlobalFlags ?? []) {
						subYargs.hide(hide);
					}

					// Ensure non-array arguments receive a single value
					for (const [key, opt] of Object.entries(args)) {
						if (!opt.array && opt.type !== "array") {
							subYargs.check(demandSingleValue(key));
						}
					}

					// Register positional arguments
					for (const key of def.positionalArgs ?? []) {
						subYargs.positional(key, args[key] as PositionalOptions);
					}
				} else if (def.type === "namespace") {
					for (const hide of def.metadata.hideGlobalFlags ?? []) {
						subYargs.hide(hide);
					}

					// Hacky way to print --help for incomplete commands
					// e.g. `wrangler kv namespace` runs `wrangler kv namespace --help`
					subYargs.command(subHelp);
				}

				// Register subtree
				registerSubTreeCallback();
			},
			// Only attach the handler for commands, not namespaces
			def.type === "command" ? createHandler(def, def.command) : undefined
		);
	};
}

function createHandler(def: CommandDefinition, commandName: string) {
	return async function handler(args: HandlerArgs<NamedArgDefinitions>) {
		// eslint-disable-next-line no-useless-catch
		try {
			const shouldPrintBanner = def.behaviour?.printBanner;

			if (
				/* No defautl behaviour override: show the banner */
				shouldPrintBanner === undefined ||
				/* Explicit opt in: show the banner */
				(typeof shouldPrintBanner === "boolean" &&
					shouldPrintBanner !== false) ||
				/* Hook resolves to true */
				(typeof shouldPrintBanner === "function" &&
					shouldPrintBanner(args) === true)
			) {
				await printWranglerBanner();
			}

			if (def.metadata.deprecated) {
				logger.warn(def.metadata.deprecatedMessage);
			}
			if (def.metadata.statusMessage) {
				logger.warn(def.metadata.statusMessage);
			}

			// TODO(telemetry): send command started event

			await def.validateArgs?.(args);

			const shouldPrintResourceLocation =
				typeof def.behaviour?.printResourceLocation === "function"
					? def.behaviour?.printResourceLocation(args)
					: def.behaviour?.printResourceLocation;
			if (shouldPrintResourceLocation) {
				// we don't have the type of args here :(
				const remote =
					"remote" in args && typeof args.remote === "boolean"
						? args.remote
						: undefined;
				const local =
					"local" in args && typeof args.local === "boolean"
						? args.local
						: undefined;
				const resourceIsLocal = isLocal({ remote, local });
				if (resourceIsLocal) {
					printResourceLocation("local");
					logger.log(
						`Use --remote if you want to access the remote instance.\n`
					);
				} else {
					printResourceLocation("remote");
				}
			}

			const experimentalFlags = def.behaviour?.overrideExperimentalFlags
				? def.behaviour?.overrideExperimentalFlags(args)
				: {
						MULTIWORKER: false,
						RESOURCES_PROVISION: args.experimentalProvision ?? false,
						REMOTE_BINDINGS: args.experimentalRemoteBindings ?? false,
						DEPLOY_REMOTE_DIFF_CHECK: false,
					};

			await run(experimentalFlags, () => {
				const config =
					def.behaviour?.provideConfig ?? true
						? readConfig(args, {
								hideWarnings: !(def.behaviour?.printConfigWarnings ?? true),
								useRedirectIfAvailable:
									def.behaviour?.useConfigRedirectIfAvailable,
							})
						: defaultWranglerConfig;

				if (def.behaviour?.warnIfMultipleEnvsConfiguredButNoneSpecified) {
					if (!("env" in args) && config.configPath) {
						const { rawConfig } = experimental_readRawConfig(
							{
								config: config.configPath,
							},
							{ hideWarnings: true }
						);
						const availableEnvs = Object.keys(rawConfig.env ?? {});
						if (availableEnvs.length > 0) {
							logger.warn(
								dedent`
										Multiple environments are defined in the Wrangler configuration file, but no target environment was specified for the ${commandName.replace(/^wrangler\s+/, "")} command.
										To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify the target environment using the \`-e|--env\` flag.
										If your intention is to use the top-level environment of your configuration simply pass an empty string to the flag to target such environment. For example \`--env=""\`.
									`
							);
						}
					}
				}

				return def.handler(args, {
					config,
					errors: { UserError, FatalError },
					logger,
					fetchResult,
				});
			});

			// TODO(telemetry): send command completed event
		} catch (err) {
			// TODO(telemetry): send command errored event
			throw err;
		}
	};
}
