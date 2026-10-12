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
