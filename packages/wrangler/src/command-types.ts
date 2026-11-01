/**
 * Shared command metadata shape. Keep this module independent of runtime
 * command definitions so generated public declarations remain self-contained.
 *
 * Internal commands supply their constrained Teams and category unions;
 * the experimental inspection API intentionally exposes string values.
 */
export type CommandMetadata<Owner extends string, Category extends string> = {
	description: string;
	status: "experimental" | "alpha" | "private beta" | "open beta" | "stable";
	statusMessage?: string;
	deprecated?: boolean;
	deprecatedMessage?: string;
	hidden?: boolean;
	owner: Owner;
	/** Prints something at the bottom of the help. */
	epilogue?: string;
	examples?: { command: string; description: string }[];
	hideGlobalFlags?: string[];
	/**
	 * Optional category for grouping commands in the help output.
	 * Commands without a category appear under the default "COMMANDS" group.
	 */
	category?: Category;
};

/** Single command identity for internal definitions and public registry views. */
export type Command = `wrangler${string}`;
export type CommandIdentity<Kind extends "command" | "namespace" | "alias"> = {
	type: Kind;
	command: Command;
};

/** Fields shared by executable commands and public structural projections. */
export type CommandDefinitionData<Metadata, Args, Behaviour, Positionals> = {
	metadata: Metadata;
	behaviour?: Behaviour;
	args?: Args;
	positionalArgs?: Positionals;
};
export type CommandNamespaceData<Metadata> = { metadata: Metadata };
export type CommandAliasData<Metadata> = {
	aliasOf: Command;
	metadata?: Partial<Metadata>;
};
export type CommandDefinitionTreeNode<Definition> = {
	definition?: Definition;
	subtree: Map<string, CommandDefinitionTreeNode<Definition>>;
};

/**
 * Shared behaviour supported by both the executable command definitions and
 * the experimental command registry. Both views use this single field source.
 */
export type CommandBehaviour<Args> = {
	/**
	 * By default, Wrangler's version banner is printed before the handler.
	 * @default true
	 */
	printBanner?: boolean | ((args: Args) => boolean);
	/**
	 * By default, Wrangler reads and provides its configuration.
	 * @default true
	 */
	provideConfig?: boolean;
	/**
	 * By default, Wrangler prints warnings about the configuration file.
	 * @default true
	 */
	printConfigWarnings?: boolean;
	/** Check for a Wrangler configuration redirect file. */
	useConfigRedirectIfAvailable?: boolean;
	/**
	 * Opt out of sending metrics for this command.
	 * @default true
	 */
	sendMetrics?: boolean;
	/**
	 * Whether this command can use a temporary preview account with the hidden
	 * `--temporary` or `--event-code` flags. R2 and Containers commands work
	 * only with event accounts created using `--event-code`.
	 * @default false
	 */
	supportTemporary?: boolean;
	/** Offer Cloudflare skills after a successful handler invocation. */
	suggestSkillsAfterHandler?: boolean | ((args: Args) => boolean);
};
