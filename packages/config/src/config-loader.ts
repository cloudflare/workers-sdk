import { resolveExportDefinition } from "./definition";
import { loadConfig } from "./load";
import { applyMode } from "./modes";
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
 *
 * Worker exports have their `modes` collapsed against `ctx.mode` after
 * validation, so every caller downstream sees a single flat config and never
 * has to reason about mode selection itself.
 *
 * Set `strictModes` when `ctx.mode` is an explicit user selection, so that
 * naming a mode the config does not declare raises {@link UnknownModeError}
 * rather than silently falling back to the base config. Callers whose mode is
 * ambient and always populated should leave it off. See {@link applyMode}.
 */
export async function loadAndValidateConfig(
	configPath: string,
	ctx: ConfigContext,
	options?: { include?: string[]; strictModes?: boolean }
): Promise<LoadAndValidateConfigResult> {
	const { exports, dependencies } = await loadConfig(configPath, options);

	const resolved: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(exports)) {
		resolved[name] = await resolveExportDefinition(value, ctx);
	}

	const result = ConfigExportsSchema.safeParse(resolved);

	if (!result.success) {
		return { result, dependencies };
	}

	// Validation runs against the authored config so that a bad binding inside a
	// mode reports against `modes.<name>.env.<binding>` rather than a merged path
	// the user never wrote.
	const withModesApplied: ParsedConfigExports = {};
	for (const [name, value] of Object.entries(result.data)) {
		withModesApplied[name] =
			value.type === "worker"
				? applyMode(value, ctx.mode, { strict: options?.strictModes })
				: value;
	}

	return { result: { ...result, data: withModesApplied }, dependencies };
}
