/**
 * Serialize the plain config object produced by {@link splitRawConfig} into
 * `cloudflare.config.ts` source text.
 *
 * The object is emitted as a JSON literal wrapped in a `defineWorker` call.
 * Binding `env` entries are printed as plain type-tagged literals
 * (`{ type: "kv", id }`), which are valid `@cloudflare/config` config — the
 * `bindings.*` builders are just sugar that produces the same shape.
 *
 * `cloudflare.config.ts` is only emitted for Vite projects, whose build tool
 * is `@cloudflare/vite-plugin`, so `defineWorker` is imported from there.
 */
import type { NewConfigSplit } from "@cloudflare/config";

/**
 * Module specifier a Vite project's `cloudflare.config.ts` imports `defineWorker`
 * from. Vite projects depend on `@cloudflare/vite-plugin` (not `wrangler`) as
 * their build tool, so the import must resolve from there.
 */
export const CLOUDFLARE_CONFIG_IMPORT_SOURCE =
	"@cloudflare/vite-plugin/experimental-config";

/**
 * Serialize the runtime config to `cloudflare.config.ts` source, importing
 * `defineWorker` from the Cloudflare Vite plugin.
 */
export function serializeCloudflareConfig(
	worker: NewConfigSplit["worker"]
): string {
	return (
		`import { defineWorker } from "${CLOUDFLARE_CONFIG_IMPORT_SOURCE}";\n\n` +
		`export default defineWorker(${JSON.stringify(worker, null, "\t")});\n`
	);
}
