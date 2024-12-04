import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { defaultWranglerConfig } from "../config/config";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { demandSingleValue } from "./helpers";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";
import type {
	CommandDefinition,
	HandlerArgs,
	InternalDefinition,
	NamedArgDefinitions,
} from "./types";

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

					yargs.options(args);

					// Ensure non-array arguments receive a single value
					for (const [key, opt] of Object.entries(args)) {
						if (!opt.array) {
							yargs.check(demandSingleValue(key));
						}
					}

					// Register positional arguments
					for (const key of def.positionalArgs ?? []) {
						yargs.positional(key, args[key]);
					}
				} else if (def.type === "namespace") {
					// Hacky way to print --help for incomplete commands
					// e.g. `wrangler kv namespace` runs `wrangler kv namespace --help`
					subYargs.command(subHelp);
				}

				// Register subtree
				registerSubTreeCallback();
			},
			// Only attach the handler for commands, not namespaces
			def.type === "command" ? createHandler(def) : undefined
		);
	};
}

function createHandler(def: CommandDefinition) {
	return async function handler(args: HandlerArgs<NamedArgDefinitions>) {
		// eslint-disable-next-line no-useless-catch
		try {
			if (def.behaviour?.printBanner !== false) {
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

			await def.handler(args, {
				config:
					def.behaviour?.provideConfig ?? true
						? readConfig(
								args.config,
								args,
								undefined,
								!(def.behaviour?.printConfigWarnings ?? true)
							)
						: defaultWranglerConfig,
				errors: { UserError, FatalError },
				logger,
				fetchResult,
			});

			// TODO(telemetry): send command completed event
		} catch (err) {
			// TODO(telemetry): send command errored event
			throw err;
		}
	};
}
