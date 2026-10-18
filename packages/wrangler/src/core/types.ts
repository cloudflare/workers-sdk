import type {
	fetchKVGetValue,
	fetchResult,
	fetchListResult,
	fetchPagedListResult,
} from "../cfetch";
import type {
	CommandAliasData,
	CommandBehaviour,
	CommandDefinitionData,
	CommandDefinitionTreeNode,
	CommandIdentity,
	CommandMetadata,
	CommandNamespaceData,
	Command as SharedCommand,
} from "../command-types";
import type { confirm, prompt } from "../dialogs";
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
		: // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Vendored yargs type requires empty object fallback
			{}
	: // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Vendored yargs type requires empty object fallback
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

export type Command = SharedCommand;
export type Metadata = CommandMetadata<Teams, MetadataCategory>;

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
	fetchListResult: typeof fetchListResult;
	fetchPagedListResult: typeof fetchPagedListResult;
	fetchKVGetValue: typeof fetchKVGetValue;

	/**
	 * Interactive prompts
	 */
	confirm: typeof confirm;
	prompt: typeof prompt;

	/**
	 * Whether the process is non-interactive or running in CI.
	 */
	isNonInteractiveOrCI: () => boolean;

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
> = CommandDefinitionData<
	Metadata,
	NamedArgDefs,
	CommandBehaviour<HandlerArgs<NamedArgDefs>> & {
		/** Opt in to the metrics banner for this command. */
		printMetricsBanner?: boolean;
		/**
		 * Override experimental flags supplied to a command's handler context.
		 */
		overrideExperimentalFlags?: (
			args: HandlerArgs<NamedArgDefs>
		) => ExperimentalFlags;
		/** Print whether this command operates on local or remote resources. */
		printResourceLocation?:
			| ((args: HandlerArgs<NamedArgDefs>) => boolean)
			| boolean;
		/** Warn when environments are defined but none has been selected. */
		warnIfMultipleEnvsConfiguredButNoneSpecified?: boolean;
		/**
		 * By default, the banner will print the active profile name.
		 * Set to false to suppress that detail while retaining the main banner.
		 * @default true
		 */
		printActiveProfile?: boolean;
	},
	Array<StringKeyOf<NamedArgDefs>>
> & {
	/**
	 * A hook to implement custom validation of the args before the handler is called.
	 * Throw `CommandLineArgsError` with actionable error message if args are invalid.
	 * The return value is ignored.
	 *
	 * @param args - The parsed CLI arguments
	 * @param def - The command definition, useful for passing to helpers like `demandOneOfOption`
	 */
	validateArgs?: (
		args: HandlerArgs<NamedArgDefs>,
		def: CommandDefinition<NamedArgDefs>
	) => void | Promise<void>;

	/**
	 * The implementation of the command which is given camelCase'd args
	 * and a ctx object of convenience properties
	 */
	handler: (
		args: HandlerArgs<NamedArgDefs>,
		ctx: HandlerContext
	) => void | Promise<void>;
};

export type NamespaceDefinition = CommandNamespaceData<Metadata>;
export type AliasDefinition = CommandAliasData<Metadata>;

export type InternalCommandDefinition = CommandIdentity<"command"> &
	CommandDefinition;
export type InternalNamespaceDefinition = CommandIdentity<"namespace"> &
	NamespaceDefinition;
export type InternalAliasDefinition = CommandIdentity<"alias"> &
	AliasDefinition;

export type InternalDefinition =
	| InternalCommandDefinition
	| InternalNamespaceDefinition
	| InternalAliasDefinition;
export type DefinitionTreeNode = CommandDefinitionTreeNode<InternalDefinition>;
export type DefinitionTree = Map<string, DefinitionTreeNode>;
