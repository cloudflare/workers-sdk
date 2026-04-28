import { generateTypesFromWranglerOptions } from "../type-generation";

interface GenerateTypesOptions {
	/**
	 * Path to the Wrangler config file to use. Can be an array for multi-config type resolution.
	 */
	config?: string | string[];

	/**
	 * Name of the Wrangler environment to generate types for.
	 */
	env?: string;

	/**
	 * Paths to `.env` files to load when inferring local variables and secrets.
	 */
	envFile?: string[];

	/**
	 * Name of the generated environment interface.
	 */
	envInterface?: string;

	/**
	 * Whether to include environment/bindings types in the output.
	 */
	includeEnv?: boolean;

	/**
	 * Whether to include runtime types in the output.
	 */
	includeRuntime?: boolean;

	/**
	 * Path to the declaration file for generated types.
	 */
	path?: string;

	/**
	 * Whether to generate strict literal/union variable types.
	 */
	strictVars?: boolean;
}

export type Unstable_GenerateTypesOptions = GenerateTypesOptions;

interface GenerateTypesResult {
	/**
	 * Combined formatted output containing all generated sections.
	 */
	content: string;

	/**
	 * Generated environment/bindings types, or `null` when env types are excluded.
	 */
	env: string | null;

	/**
	 * Target declaration file path associated with this generation run.
	 */
	path: string;

	/**
	 * Generated runtime types, or `null` when runtime types are excluded.
	 */
	runtime: string | null;
}

export type Unstable_GenerateTypesResult = GenerateTypesResult;

/**
 * Generate types from your Worker configuration
 *
 * @description Programmatically generate TypeScript type definitions for your
 * Worker, using the same logic that powers the `wrangler types` CLI command.
 *
 * @param options - Type generation configuration options that mirror the `wrangler types` CLI flags
 *
 * @returns Structured output containing combined content & split env/runtime sections.
 */
export async function generateTypes(
	options: Unstable_GenerateTypesOptions
): Promise<Unstable_GenerateTypesResult> {
	const generated = await generateTypesFromWranglerOptions(options);
	return {
		content: generated.content,
		env: generated.env,
		path: generated.path,
		runtime: generated.runtime,
	};
}
