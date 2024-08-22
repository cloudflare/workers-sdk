import chalk from "chalk";
import { CommandBuilder } from "yargs";
import { readConfig } from "../config";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { CommonYargsOptions } from "../yargs-types";
import {
	BaseNamedArgDefinitions,
	CommandDefinition,
	HandlerArgs,
	NamespaceDefinition,
} from "./define-command";

const betaCmdColor = "#BD5B08";

export function wrapCommandDefinition(
	def: CommandDefinition | NamespaceDefinition
) {
	let commandSuffix = "";
	let description = def.metadata.description;
	let statusMessage = "";
	let defaultDeprecatedMessage = `Deprecated: "${def.command}" is deprecated`; // TODO: improve
	let deprecatedMessage = def.metadata.deprecated
		? def.metadata.deprecatedMessage ?? defaultDeprecatedMessage
		: undefined;
	let defineArgs: undefined | CommandBuilder<CommonYargsOptions> = undefined;
	let handler:
		| undefined
		| ((args: HandlerArgs<BaseNamedArgDefinitions>) => Promise<void>) =
		undefined;

	if (def.metadata.status !== "stable") {
		description += chalk.hex(betaCmdColor)(` [${def.metadata.status}]`);

		statusMessage =
			def.metadata.statusMessage ??
			`🚧 \`${def.command}\` is a ${def.metadata.status} command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose`;
	}

	if ("positionalArgs" in def) {
		const commandPositionalArgsSuffix = def.positionalArgs
			?.map((key) => {
				const { demandOption, array } = def.args[key];
				if (demandOption) return `<${key}${array ? ".." : ""}>`; // <key> or <key..>
				return `[${key}${array ? ".." : ""}]`; // [key] or [key..]
			})
			.join(" ");

		if (commandPositionalArgsSuffix) {
			commandSuffix += " " + commandPositionalArgsSuffix;
		}
	}

	if ("args" in def) {
		defineArgs = (yargs) => {
			if ("args" in def) {
				yargs.options(def.args);

				for (const key of def.positionalArgs ?? []) {
					yargs.positional(key, def.args[key]);
				}
			}

			if (def.metadata.statusMessage) {
				yargs.epilogue(def.metadata.statusMessage);
			}

			return yargs;
		};
	}

	if ("handler" in def) {
		handler = async (args: HandlerArgs<BaseNamedArgDefinitions>) => {
			try {
				await printWranglerBanner();

				if (deprecatedMessage) {
					logger.warn(deprecatedMessage);
				}
				if (statusMessage) {
					logger.warn(statusMessage);
				}

				// TODO(telemetry): send command started event

				await def.handler(args, {
					config: readConfig(args.config, args),
					errors: { UserError, FatalError },
					logger,
				});

				// TODO(telemetry): send command completed event
			} catch (err) {
				// TODO(telemetry): send command errored event
				throw err;
			}
		};
	}

	return {
		commandSuffix,
		description: description,
		hidden: def.metadata.hidden,
		deprecatedMessage,
		statusMessage,
		defineArgs,
		handler,
	};
}
