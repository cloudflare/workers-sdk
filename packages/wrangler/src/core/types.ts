import type { fetchResult } from "../cfetch";
import type { ExperimentalFlags } from "../experimental-flags";
import type { Logger } from "../logger";
import type { CommonYargsOptions, RemoveIndex } from "../yargs-types";
import type { Teams } from "./teams";
import type { Config, FatalError, UserError } from "@cloudflare/workers-utils";
import type Cloudflare from "cloudflare";
import type {
	ArgumentsCamelCase,
	InferredOptionType,
	InferredOptionTypes,
	Options,
	PositionalOptions,
} from "yargs";

// Vendored from yargs
/** Convert literal string types like 'foo-bar' to 'FooBar' */
type PascalCase<S extends string> = string extends S
	? string
	: S extends `${infer T}-${infer U}`
		? `${Capitalize<T>}${PascalCase<U>}`
		: Capitalize<S>;

// Vendored from yargs
/** Convert literal string types like 'foo-bar' to 'fooBar' */
type CamelCase<S extends string> = string extends S
	? string
	: S extends `${infer T}-${infer U}`
		? `${T}${PascalCase<U>}`
		: S;

// Vendored from yargs
type CamelCaseKey<K extends PropertyKey> = K extends string
	? Exclude<CamelCase<K>, "">
	: K;

// Vendored from yargs
type Alias<O extends Options | PositionalOptions> = O extends { alias: infer T }
	? T extends Exclude<string, T>
		? { [key in T]: InferredOptionType<O> }
		: // eslint-disable-next-line @typescript-eslint/no-empty-object-type
			{}
	: // eslint-disable-next-line @typescript-eslint/no-empty-object-type
		{};

type StringKeyOf<T> = Extract<keyof T, string>;
export type DeepFlatten<T> = T extends object
	? { [K in keyof T]: DeepFlatten<T[K]> }
	: T;

export type MetadataCategory =
	| "Account"
	| "Compute & AI"
	| "Storage & databases"
	| "Networking & security";

export type Command = `wrangler${string}`;
export type Metadata = {
	description: string;
	status: "experimental" | "alpha" | "private beta" | "open beta" | "stable";
	statusMessage?: string;
	deprecated?: boolean;
	deprecatedMessage?: string;
	hidden?: boolean;
	owner: Teams;
	/** Prints something at the bottom of the help */
	epilogue?: string;
	examples?: {
		command: string;
		description: string;
	}[];
	hideGlobalFlags?: string[];
	/**
	 * Optional category for grouping commands in the help output.
	 * Commands with the same category will be grouped together under a shared heading.
	 * Commands without a category will appear under the default "COMMANDS" group.
	 */
	category?: MetadataCategory;
};

export type ArgDefinition = Omit<PositionalOptions, "type"> &
	Pick<Options, "hidden" | "requiresArg" | "deprecated" | "type">;
export type NamedArgDefinitions = { [key: string]: ArgDefinition };

export type OnlyCamelCase<T = Record<string, never>> = {
	[key in keyof T as CamelCaseKey<key>]: T[key];
};

export type HandlerArgs<Args extends NamedArgDefinitions> = DeepFlatten<
	OnlyCamelCase<
		RemoveIndex<
			ArgumentsCamelCase<
				CommonYargsOptions & InferredOptionTypes<Args> & Alias<Args>
			>
		>
	>
>;

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
	 * Use fetchResult to make *auth'd* requests to the Cloudflare API.
	 */
	fetchResult: typeof fetchResult;
	/**
	 * Error classes provided to the command implementor as a convenience
	 * to aid discoverability and to encourage their usage.
	 */
	errors: {
		UserError: typeof UserError;
		FatalError: typeof FatalError;

		// TODO: extend with other categories of error
	};
	/**
	 * API SDK
	 */
	sdk: Cloudflare;

	// TODO: experiments

	// TODO: prompt (cli package)
	// TODO: accountId
};

export type CommandDefinition<
	NamedArgDefs extends NamedArgDefinitions = NamedArgDefinitions,
> = {
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
		 * By default, wrangler's version banner will be printed before the handler is executed.
		 * Set this value to `false` to skip printing the banner.
		 *
		 * @default true
		 */
		printBanner?: boolean | ((args: HandlerArgs<NamedArgDefs>) => boolean);

		/**
		 * By default, wrangler will print warnings about the Wrangler configuration file.
		 * Set this value to `false` to skip printing these warnings.
		 */
		printConfigWarnings?: boolean;

		/**
		 * By default, wrangler will read & provide the wrangler.toml/wrangler.json configuration.
		 * Set this value to `false` to skip this.
		 */
		provideConfig?: boolean;

		/**
		 * By default, wrangler will provide experimental flags in the handler context,
		 * according to the default values in register-yargs.command.ts
		 * Use this to override those defaults per command.
		 */
		overrideExperimentalFlags?: (
			args: HandlerArgs<NamedArgDefs>
		) => ExperimentalFlags;

		/**
		 * If true, then look for a redirect file at `.wrangler/deploy/config.json` and use that to find the Wrangler configuration file.
		 */
		useConfigRedirectIfAvailable?: boolean;

		/**
		 * If true, print a message about whether the command is operating on a local or remote resource
		 */
		printResourceLocation?:
			| ((args: HandlerArgs<NamedArgDefs>) => boolean)
			| boolean;

		/**
		 * If true, check for environments in the wrangler config, if there are some and the user hasn't specified an environment
		 * using the `-e|--env` cli flag, show a warning suggesting that one should instead be specified.
		 */
		warnIfMultipleEnvsConfiguredButNoneSpecified?: boolean;
	};

	/**
	 * A plain key-value object describing the CLI args for this command.
	 * Shared args can be defined as another plain object and spread into this.
	 */
	args?: NamedArgDefs;

	/**
	 * Optionally declare some of the named args as positional args.
	 * The order of this array is the order they are expected in the command.
	 * Use args[key].demandOption and args[key].array to declare required and variadic
	 * positional args, respectively.
	 */
	positionalArgs?: Array<StringKeyOf<NamedArgDefs>>;

	/**
	 * A hook to implement custom validation of the args before the handler is called.
	 * Throw `CommandLineArgsError` with actionable error message if args are invalid.
	 * The return value is ignored.
	 */
	validateArgs?: (args: HandlerArgs<NamedArgDefs>) => void | Promise<void>;

	/**
	 * The implementation of the command which is given camelCase'd args
	 * and a ctx object of convenience properties
	 */
	handler: (
		args: HandlerArgs<NamedArgDefs>,
		ctx: HandlerContext
	) => void | Promise<void>;
};

export type NamespaceDefinition = {
	metadata: Metadata;
};

export type AliasDefinition = {
	aliasOf: Command;
	metadata?: Partial<Metadata>;
};

export type InternalDefinition =
	| ({ type: "command"; command: Command } & CommandDefinition)
	| ({ type: "namespace"; command: Command } & NamespaceDefinition)
	| ({ type: "alias"; command: Command } & AliasDefinition);
export type DefinitionTreeNode = {
	definition?: InternalDefinition;
	subtree: DefinitionTree;
};
export type DefinitionTree = Map<string, DefinitionTreeNode>;
