import { createCLIParser } from "./index";
import type {
	CommandAliasData,
	CommandBehaviour,
	CommandDefinitionData,
	CommandDefinitionTreeNode,
	CommandIdentity,
	CommandMetadata,
	CommandNamespaceData,
} from "./command-types";

export type ExperimentalCommandMetadata = CommandMetadata<string, string>;

type ExperimentalStringRequirement =
	| string
	| readonly string[]
	| Record<string, string | readonly string[]>;

export type ExperimentalCommandArgDefinition = {
	alias?: string | readonly string[];
	array?: boolean;
	boolean?: boolean;
	choices?: ReadonlyArray<string | number | true | undefined>;
	coerce?: (arg: unknown) => unknown;
	config?: boolean;
	configParser?: (configPath: string) => object;
	conflicts?: ExperimentalStringRequirement;
	count?: boolean;
	default?: unknown;
	defaultDescription?: string;
	demand?: boolean | string;
	deprecate?: boolean | string;
	deprecated?: boolean | string;
	demandOption?: boolean | string;
	desc?: string;
	describe?: string;
	description?: string;
	global?: boolean;
	group?: string;
	hidden?: boolean;
	implies?: ExperimentalStringRequirement;
	nargs?: number;
	normalize?: boolean;
	number?: boolean;
	require?: boolean | string;
	required?: boolean | string;
	requiresArg?: boolean;
	skipValidation?: boolean;
	string?: boolean;
	type?: "array" | "count" | "boolean" | "number" | "string";
};

/**
 * Yargs's internal ArgDefinition is intentionally projected into public
 * option metadata: Yargs is not a published Wrangler dependency.
 */
export type ExperimentalCommandBehaviour = CommandBehaviour<unknown> & {
	[key: string]: unknown;
};

export type ExperimentalCommandCommandDefinition = CommandIdentity<"command"> &
	CommandDefinitionData<
		ExperimentalCommandMetadata,
		Record<string, ExperimentalCommandArgDefinition>,
		ExperimentalCommandBehaviour,
		string[]
	> & {
		validateArgs?: (...args: unknown[]) => unknown;
		handler?: (...args: unknown[]) => unknown;
	};

export type ExperimentalCommandNamespaceDefinition =
	CommandIdentity<"namespace"> &
		CommandNamespaceData<ExperimentalCommandMetadata>;

export type ExperimentalCommandAliasDefinition = CommandIdentity<"alias"> &
	CommandAliasData<ExperimentalCommandMetadata>;

export type ExperimentalCommandDefinition =
	| ExperimentalCommandCommandDefinition
	| ExperimentalCommandNamespaceDefinition
	| ExperimentalCommandAliasDefinition;

export type ExperimentalDefinitionTreeNode =
	CommandDefinitionTreeNode<ExperimentalCommandDefinition>;

export type ExperimentalGlobalFlags = Record<
	string,
	ExperimentalCommandArgDefinition
>;

export type ExperimentalWranglerCommands = {
	registry: ExperimentalDefinitionTreeNode;
	globalFlags: ExperimentalGlobalFlags;
};

/**
 * EXPERIMENTAL: Get all registered Wrangler commands for documentation generation.
 * This API is experimental and may change without notice.
 *
 * The published return type is a dependency-free structural view of the
 * command registry. Runtime definitions can contain additional internal
 * properties, but implementation-only dependency types are intentionally kept
 * out of Wrangler's public declaration boundary.
 *
 * @returns An object containing the command tree structure and global flags
 */
export function experimental_getWranglerCommands(): ExperimentalWranglerCommands {
	const { registry, globalFlags } = createCLIParser([]);
	return {
		registry:
			registry.getDefinitionTreeRoot() as ExperimentalDefinitionTreeNode,
		globalFlags: globalFlags as ExperimentalGlobalFlags,
	};
}
