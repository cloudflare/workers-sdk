import type { Config } from "../config";
import type { OnlyCamelCase } from "../config/config";
import type { FatalError, UserError } from "../errors";
import type { Logger } from "../logger";
import type { CommonYargsOptions, RemoveIndex } from "../yargs-types";
import type { Teams } from "./teams";
import type {
	Alias,
	ArgumentsCamelCase,
	InferredOptionTypes,
	Options,
	PositionalOptions,
} from "yargs";

export type Command = `wrangler${string}`;
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
export type BaseNamedArgDefinitions = {
	[key: string]: ArgDefinition;
};
type StringKeyOf<T> = Extract<keyof T, string>;
export type HandlerArgs<Args extends BaseNamedArgDefinitions> = DeepFlatten<
	OnlyCamelCase<
		RemoveIndex<
			ArgumentsCamelCase<
				CommonYargsOptions & InferredOptionTypes<Args> & Alias<Args>
			>
		>
	>
>;

type DeepFlatten<T> = T extends object
	? { [K in keyof T]: DeepFlatten<T[K]> }
	: T;

export type HandlerContext = {
	/**
	 * The wrangler config file read from disk and parsed.
	 */
	config: Config;
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
		 * By default, metrics are sent if the user has opted-in.
		 * Set this value to `false` to disable metrics unconditionally.
		 *
		 * @default true
		 */
		sendMetrics?: boolean;

		/**
		 * By default, wrangler's version banner will be printed before the handler is executed.
		 * Set this value to `false` to skip printing the banner.
		 *
		 * @default true
		 */
		printBanner?: boolean;
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
	 * A hook to implement custom validation of the args before the handler is called.
	 * Throw `CommandLineArgsError` with actionable error message if args are invalid.
	 * The return value is ignored.
	 */
	validateArgs?: (args: HandlerArgs<NamedArgs>) => void | Promise<void>;

	/**
	 * The implementation of the command which is given camelCase'd args
	 * and a ctx object of convenience properties
	 */
	handler: (
		args: HandlerArgs<NamedArgs>,
		ctx: HandlerContext
	) => void | Promise<void>;
};

export const COMMAND_DEFINITIONS: Array<
	CommandDefinition | NamespaceDefinition | AliasDefinition
> = [];

export function defineCommand<NamedArgs extends BaseNamedArgDefinitions>(
	definition: CommandDefinition<NamedArgs>
) {
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
