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
 * The exports of a `cloudflare.config.ts` that {@link loadAndValidateConfig}
 * treats as config. Everything else the module exports is ignored.
 */
export const CONFIG_EXPORT_NAMES = ["default", "settings"];

/**
 * Load a `cloudflare.config.ts`, resolve its config exports, and validate them
 * against {@link ConfigExportsSchema}.
 *
 * Only the exports named in `options.include` are resolved — defaulting to
 * {@link CONFIG_EXPORT_NAMES}. Any other export (a shared constant, a helper
 * function, a re-export) is left alone, so authors can keep values alongside
 * their config the same way they already can in a `wrangler.config.ts`.
 *
 * The filtering happens inside `loadConfig`, *before* resolution, and that
 * ordering is load-bearing: resolving an export **invokes** it when it is a
 * function. Widening `include` therefore means calling arbitrary user code
 * with the config context at config-load time.
 */
export async function loadAndValidateConfig(
	configPath: string,
	ctx: ConfigContext,
	options?: { include?: string[] }
): Promise<LoadAndValidateConfigResult> {
	const { exports, dependencies } = await loadConfig(configPath, {
		include: options?.include ?? CONFIG_EXPORT_NAMES,
	});

	const resolved: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(exports)) {
		resolved[name] = await resolveExportDefinition(value, ctx);
	}

	const result = ConfigExportsSchema.safeParse(resolved);

	return { result, dependencies };
}
