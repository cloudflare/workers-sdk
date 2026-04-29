import {
	generateTypesFromWranglerOptions,
	type GenerateTypesOptions,
} from "../type-generation";

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
