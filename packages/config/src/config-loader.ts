import { resolveExportDefinition } from "./definition";
import { loadConfig } from "./load";
import { ConfigExportsSchema } from "./schema";
import type { ConfigContext } from "./definition";
import type { ParsedConfigExports } from "./schema";
import type * as z from "zod";

export interface LoadAndValidateConfigResult {
	/**
	 * Zod result for the validated exports record, keyed by JS export name.
	 * Consumers format `result.error` themselves.
	 */
	result: z.ZodSafeParseResult<ParsedConfigExports>;
	/** Transitive deps imported while resolving the config (node_modules excluded). */
	dependencies: Set<string>;
}

/**
 * Load a `cloudflare.config.ts`, resolve all exports, and validate against {@link ConfigExportsSchema}.
 */
export async function loadAndValidateConfig(
	configPath: string,
	ctx: ConfigContext,
	options?: { include?: string[] }
): Promise<LoadAndValidateConfigResult> {
	const { exports, dependencies } = await loadConfig(configPath, options);

	const resolved: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(exports)) {
		resolved[name] = await resolveExportDefinition(value, ctx);
	}

	const result = ConfigExportsSchema.safeParse(resolved);

	return { result, dependencies };
}
