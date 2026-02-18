import {
	defaultWranglerConfig,
	FatalError,
	getWranglerHideBanner,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { experimental_loadRawConfig } from "../../../workers-utils/src";
import { fetchResult } from "../cfetch";
import { createCloudflareClient } from "../cfetch/internal";
import { loadConfig } from "../config";
import { run } from "../experimental-flags";
import { logger } from "../logger";
import { getMetricsDispatcher } from "../metrics";
import {
	COMMAND_ARG_ALLOW_LIST,
	getAllowedArgs,
	sanitizeArgKeys,
	sanitizeArgValues,
} from "../metrics/sanitization";
import { writeOutput } from "../output";
import { addBreadcrumb } from "../sentry";
import { dedent } from "../utils/dedent";
import { isLocal, printResourceLocation } from "../utils/is-local";
import { printWranglerBanner } from "../wrangler-banner";
import { CommandHandledError } from "./CommandHandledError";
import { getErrorType, handleError } from "./handle-errors";
import { demandSingleValue } from "./helpers";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";
import type {
	HandlerArgs,
	InternalCommandDefinition,
	InternalDefinition,
	NamedArgDefinitions,
} from "./types";
import type { PositionalOptions } from "yargs";

/**
 * Creates a function for registering commands using Yargs.
 */
export function createRegisterYargsCommand(
	yargs: CommonYargsArgv,
	subHelp: SubHelp,
	argv: string[]
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
			def.type === "command" ? createHandler(def, argv) : undefined
		);
	};
}

function createHandler(def: InternalCommandDefinition, argv: string[]) {
	// Strip "wrangler " prefix to get just the command (e.g., "wrangler dev" -> "dev").
	// What is left is safe to use in metrics and sentry messages as the parts of the command are taken directly from the command definition.
	const sanitizedCommand = def.command.replace(/^wrangler\s+/, "");

	return async function handler(args: HandlerArgs<NamedArgDefinitions>) {
		const startTime = Date.now();

		// The command definition's `command` string is safe to use in sentry messages.
		// Sentry breadcrumbs expect the `wrangler` prefix.
		addBreadcrumb(def.command);

		try {
			const shouldPrintBanner = def.behaviour?.printBanner ?? true;

			if (
				shouldPrintBanner === true ||
				(typeof shouldPrintBanner === "function" &&
					shouldPrintBanner(args) === true)
			) {
				await printWranglerBanner();
			}

			if (!getWranglerHideBanner()) {
				if (def.metadata.deprecated) {
					logger.warn(def.metadata.deprecatedMessage);
				}

				if (def.metadata.statusMessage) {
					logger.warn(def.metadata.statusMessage);
				}
			}

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
						AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
					};

			await run(experimentalFlags, async () => {
				const config =
					def.behaviour?.provideConfig ?? true
						? await loadConfig(args, {
								hideWarnings: !(def.behaviour?.printConfigWarnings ?? true),
								useRedirectIfAvailable:
									def.behaviour?.useConfigRedirectIfAvailable,
							})
						: defaultWranglerConfig;

				const dispatcher = getMetricsDispatcher({
					sendMetrics: config.send_metrics,
					hasAssets: !!config.assets?.directory,
					configPath: config.configPath,
					argv,
				});

				if (def.behaviour?.warnIfMultipleEnvsConfiguredButNoneSpecified) {
					if (!("env" in args) && config.configPath) {
						const { rawConfig } = await experimental_loadRawConfig(
							{
								config: config.configPath,
							},
							{ hideWarnings: true }
						);
						const availableEnvs = Object.keys(rawConfig.env ?? {});
						if (availableEnvs.length > 0) {
							logger.warn(
								dedent`
										Multiple environments are defined in the Wrangler configuration file, but no target environment was specified for the ${sanitizedCommand} command.
										To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify the target environment using the \`-e|--env\` flag.
										If your intention is to use the top-level environment of your configuration simply pass an empty string to the flag to target such environment. For example \`--env=""\`.
									`
							);
						}
					}
				}

				const allowedArgs = getAllowedArgs(
					COMMAND_ARG_ALLOW_LIST,
					sanitizedCommand
				);
				const argsWithSanitizedKeys = sanitizeArgKeys(args, argv);
				const sanitizedArgs = sanitizeArgValues(
					argsWithSanitizedKeys,
					allowedArgs
				);
				const argsUsed = Object.keys(argsWithSanitizedKeys).sort();

				dispatcher.sendCommandEvent(
					"wrangler command started",
					{
						sanitizedCommand,
						sanitizedArgs,
						argsUsed,
					},
					def.behaviour
				);

				try {
					const result = await def.handler(args, {
						sdk: createCloudflareClient(config),
						config,
						errors: { UserError, FatalError },
						logger,
						fetchResult,
					});

					const durationMs = Date.now() - startTime;
					dispatcher.sendCommandEvent(
						"wrangler command completed",
						{
							sanitizedCommand,
							sanitizedArgs,
							argsUsed,
							durationMs,
						},
						def.behaviour
					);

					return result;
				} catch (err) {
					// If the error is already a CommandHandledError (e.g., from a nested wrangler.parse() call),
					// don't wrap it again; just rethrow.
					if (err instanceof CommandHandledError) {
						throw err;
					}

					const durationMs = Date.now() - startTime;
					dispatcher.sendCommandEvent(
						"wrangler command errored",
						{
							sanitizedCommand,
							sanitizedArgs,
							argsUsed,
							durationMs,
							errorType: getErrorType(err),
							errorMessage:
								err instanceof UserError ? err.telemetryMessage : undefined,
						},
						def.behaviour
					);

					await handleError(err, args, argv);

					// Wrap the error to signal that the telemetry has already been sent and the error reporting handled.
					throw new CommandHandledError(err);
				}
			});
		} catch (err) {
			// Write handler failure to output file if one exists
			// Unwrap CommandHandledError to get the original error for output
			const outputErr =
				err instanceof CommandHandledError ? err.originalError : err;
			if (outputErr instanceof Error) {
				const code =
					"code" in outputErr ? (outputErr.code as number) : undefined;
				writeOutput({
					type: "command-failed",
					version: 1,
					code,
					message: outputErr.message,
				});
			}
			throw err;
		}
	};
}
