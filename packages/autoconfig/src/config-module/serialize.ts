/**
 * Serialize the plain config objects produced by {@link splitRawConfig} into
 * `cloudflare.config.ts` / `wrangler.config.ts` source text.
 *
 * The objects are emitted as TypeScript object literals wrapped in the
 * appropriate `defineWorker` / `defineWranglerConfig` call. Binding `env`
 * entries are printed as plain type-tagged literals (`{ type: "kv", id }`),
 * which are valid `@cloudflare/config` config — the `bindings.*` builders are
 * just sugar that produces the same shape.
 */
import type { NewConfigSplit } from "@cloudflare/config";

/**
 * Module specifier `wrangler.config.ts` (and a non-Vite project's
 * `cloudflare.config.ts`) imports its `define*` helpers from.
 * `wrangler/experimental-config` re-exports both `defineWorker` and
 * `defineWranglerConfig`.
 */
export const WRANGLER_CONFIG_IMPORT_SOURCE = "wrangler/experimental-config";

/**
 * Module specifier a Vite project's `cloudflare.config.ts` imports `defineWorker`
 * from. Vite projects depend on `@cloudflare/vite-plugin` (not `wrangler`) as
 * their build tool, so the import must resolve from there.
 */
export const VITE_CONFIG_IMPORT_SOURCE =
	"@cloudflare/vite-plugin/experimental-config";

/**
 * The module specifier a project's `cloudflare.config.ts` should import its
 * `defineWorker` helper from: the Vite plugin for Vite projects, otherwise
 * wrangler (which owns the build tooling, and emits the `wrangler.config.ts`).
 */
export function cloudflareConfigImportSource(isVite: boolean): string {
	return isVite ? VITE_CONFIG_IMPORT_SOURCE : WRANGLER_CONFIG_IMPORT_SOURCE;
}

function emitModule(
	helper: string,
	config: Record<string, unknown>,
	importSource: string
): string {
	return (
		`import { ${helper} } from "${importSource}";\n\n` +
		`export default ${helper}(${JSON.stringify(config, null, "\t")});\n`
	);
}

/**
 * Serialize the runtime config to `cloudflare.config.ts` source. The
 * `importSource` selects where `defineWorker` is imported from — pass
 * {@link cloudflareConfigImportSource} based on whether the project is Vite.
 */
export function serializeCloudflareConfig(
	worker: NewConfigSplit["worker"],
	importSource: string = WRANGLER_CONFIG_IMPORT_SOURCE
): string {
	return emitModule("defineWorker", worker, importSource);
}

/**
 * Serialize the tooling config to `wrangler.config.ts` source. Only non-Vite
 * (wrangler-owned) projects emit this file, so it always imports from wrangler.
 */
export function serializeWranglerConfig(
	tooling: NewConfigSplit["tooling"],
	importSource: string = WRANGLER_CONFIG_IMPORT_SOURCE
): string {
	return emitModule("defineWranglerConfig", tooling, importSource);
}
