import { getGlobalConfigPath } from "@cloudflare/workers-utils";

/**
 * The `cf` CLI's global config directory: `~/.config/cloudflare` (XDG) — no
 * leading dot (unlike wrangler's `.wrangler`) and no legacy `~/.cloudflare`
 * fallback, since `cf` is new and has no historical home-dir layout to be
 * compatible with. Resolved lazily so `runInTempDir()` fixtures (which re-stub
 * `HOME` / `XDG_CONFIG_HOME`) are honoured per call.
 */
export function getCfConfigPath(): string {
	return getGlobalConfigPath({
		appName: "cloudflare",
		leadingDot: false,
		useLegacyHomeDir: false,
	});
}
