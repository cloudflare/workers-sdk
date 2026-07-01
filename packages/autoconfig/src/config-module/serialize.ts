/**
 * Serialize the plain worker config object produced by {@link toCloudflareConfig}
 * into `cloudflare.config.ts` source text.
 *
 * The object is emitted as a JSON literal wrapped in a `defineWorker` call.
 * `cloudflare.config.ts` is only emitted for Vite projects, whose build tool
 * is `@cloudflare/vite-plugin`, so `defineWorker` is imported from there.
 */
import type { CloudflareConfigSplit } from "./convert";

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
	worker: CloudflareConfigSplit["worker"]
): string {
	return (
		`import { defineWorker } from "${CLOUDFLARE_CONFIG_IMPORT_SOURCE}";\n\n` +
		`export default defineWorker(${JSON.stringify(worker, null, "\t")});\n`
	);
}
