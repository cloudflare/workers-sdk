import { createCLIParser } from "./index";

export type ExperimentalCommandMetadata = {
	description: string;
	status: "experimental" | "alpha" | "private beta" | "open beta" | "stable";
	statusMessage?: string;
	deprecated?: boolean;
	deprecatedMessage?: string;
	hidden?: boolean;
	owner: string;
	category?: string;
	epilogue?: string;
	examples?: Array<{ command: string; description: string }>;
	hideGlobalFlags?: string[];
};

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

export type ExperimentalCommandBehaviour = {
	printBanner?: boolean | ((args: unknown) => boolean);
	provideConfig?: boolean;
	printConfigWarnings?: boolean;
	useConfigRedirectIfAvailable?: boolean;
	sendMetrics?: boolean;
	supportTemporary?: boolean;
	suggestSkillsAfterHandler?: boolean | ((args: unknown) => boolean);
	[key: string]: unknown;
};

export type ExperimentalCommandCommandDefinition = {
	type: "command";
	command: `wrangler${string}`;
	metadata: ExperimentalCommandMetadata;
	args?: Record<string, ExperimentalCommandArgDefinition>;
	behaviour?: ExperimentalCommandBehaviour;
	positionalArgs?: string[];
	validateArgs?: (...args: unknown[]) => unknown;
	handler?: (...args: unknown[]) => unknown;
};

export type ExperimentalCommandNamespaceDefinition = {
	type: "namespace";
	command: `wrangler${string}`;
	metadata: ExperimentalCommandMetadata;
};

export type ExperimentalCommandAliasDefinition = {
	type: "alias";
	command: `wrangler${string}`;
	aliasOf: `wrangler${string}`;
	metadata?: Partial<ExperimentalCommandMetadata>;
};

export type ExperimentalCommandDefinition =
	| ExperimentalCommandCommandDefinition
	| ExperimentalCommandNamespaceDefinition
	| ExperimentalCommandAliasDefinition;

export type ExperimentalDefinitionTreeNode = {
	definition?: ExperimentalCommandDefinition;
	subtree: Map<string, ExperimentalDefinitionTreeNode>;
};

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
