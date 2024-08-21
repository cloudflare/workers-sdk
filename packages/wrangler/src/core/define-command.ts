import { OnlyCamelCase } from "../config/config";
import { FatalError, UserError } from "../errors";
import { CommonYargsOptions } from "../yargs-types";
import { Teams } from "./teams";
import type { Config } from "../config";
import type { Logger } from "../logger";
import type {
	Alias,
	ArgumentsCamelCase,
	InferredOptionTypes,
	Options,
	PositionalOptions,
} from "yargs";

export type Command = `wrangler ${string}`;
export type Metadata = {
	description: string;
	status: "experimental" | "alpha" | "private-beta" | "open-beta" | "stable";
	statusMessage?: string;
	deprecated?: boolean;
	deprecatedMessage?: string;
	hidden?: boolean;
	owner: Teams;
};

export type ArgDefinition = PositionalOptions & Pick<Options, "hidden">;
export type BaseNamedArgDefinitions = { [key: string]: ArgDefinition };
type StringKeyOf<T> = Extract<keyof T, string>;
export type HandlerArgs<Args extends BaseNamedArgDefinitions> = OnlyCamelCase<
	ArgumentsCamelCase<
		CommonYargsOptions & InferredOptionTypes<Args> & Alias<Args>
	>
>;

export type HandlerContext<RequireConfig extends boolean> = {
	/**
	 * The wrangler config file read from disk and parsed.
	 * If no config file can be found, this value will undefined.
	 * Set `behaviour.requireConfig` to refine this type and
	 * throw if it cannot be found.
	 */
	config: RequireConfig extends true ? Config : Config | undefined;
	/**
	 * The logger instance provided to the command implementor as a convenience.
	 */
	logger: Logger;
	/**
	 * Error classes provided to the command implementor as a convenience
	 * to aid discoverability and to encourage their usage.
	 */
	errors: {
		UserError: typeof UserError;
		FatalError: typeof FatalError;

		// TODO: extend with other categories of error
	};

	// TODO: experiments
	// TODO(future): API SDK

	// TODO: prompt (cli package)
	// TODO: accountId
};

export type CommandDefinition<
	NamedArgs extends BaseNamedArgDefinitions = BaseNamedArgDefinitions,
	RequireConfig extends boolean = boolean,
> = {
	/**
	 * The full command as it would be written by the user.
	 */
	command: Command;

	/**
	 * Descriptive information about the command which does not affect behaviour.
	 * This is used for the CLI --help and subcommand --help output.
	 * This should be used as the source-of-truth for status and ownership.
	 */
	metadata: Metadata;
	/**
	 * Controls shared behaviour across all commands.
	 * This will allow wrangler commands to remain consistent and only diverge intentionally.
	 */
	behaviour?: {
		/**
		 * If true, throw error if a config file cannot be found.
		 */
		requireConfig?: RequireConfig; // boolean type which affects the HandlerContext type
		/**
		 * By default, metrics are sent if the user has opted-in.
		 * This allows metrics to be disabled unconditionally.
		 */
		sendMetrics?: false;
		sharedArgs?: {
			/**
			 * Enable the --config arg which allows the user to override the default config file path
			 */
			config?: boolean;
			/**
			 * Enable the --account-id arg which allows the user to override the CLOUDFLARE_ACCOUNT_ID env var and accountId config property
			 */
			accountId?: boolean;
			/**
			 * Enable the --json arg which enables
			 */
			json?: boolean;

			// TODO: experimental flags
		};
	};

	/**
	 * A plain key-value object describing the CLI args for this command.
	 * Shared args can be defined as another plain object and spread into this.
	 */
	args: NamedArgs;
	/**
	 * Optionally declare some of the named args as positional args.
	 * The order of this array is the order they are expected in the command.
	 * Use args[key].demandOption and args[key].array to declare required and variadic
	 * positional args, respectively.
	 */
	positionalArgs?: Array<StringKeyOf<NamedArgs>>;

	/**
	 * The implementation of the command which is given camelCase'd args
	 * and a ctx object of convenience properties
	 */
	handler: (
		args: HandlerArgs<NamedArgs>,
		ctx: HandlerContext<RequireConfig>
	) => void | Promise<void>;
};

export const COMMAND_DEFINITIONS: Array<
	CommandDefinition | NamespaceDefinition | AliasDefinition
> = [];

export function defineCommand<
	NamedArgs extends BaseNamedArgDefinitions,
	RequireConfig extends boolean,
>(definition: CommandDefinition<NamedArgs, RequireConfig>) {
	COMMAND_DEFINITIONS.push(definition as unknown as CommandDefinition);

	return {
		definition,
		get args(): HandlerArgs<NamedArgs> {
			throw new Error();
		},
	};
}

export type NamespaceDefinition = {
	command: Command;
	metadata: Metadata;
};
export function defineNamespace(definition: NamespaceDefinition) {
	COMMAND_DEFINITIONS.push(definition);
}

export type AliasDefinition = {
	command: Command;
	aliasOf: Command;
	metadata?: Partial<Metadata>;
};
export function defineAlias(definition: AliasDefinition) {
	COMMAND_DEFINITIONS.push(definition);
}
