import { getGlobalConfigPath } from "@cloudflare/workers-utils";

/**
 * The `cf` CLI's global config directory: `~/.config/cloudflare` (XDG) — no
 * legacy `~/.cloudflare` fallback, since `cf` is new and has no historical
 * home-dir layout to be compatible with. Resolved lazily so `runInTempDir()`
 * fixtures (which re-stub `HOME` / `XDG_CONFIG_HOME`) are honoured per call.
 */
export function getCfConfigPath(): string {
	return getGlobalConfigPath({
		appName: "cloudflare",
		useLegacyHomeDir: false,
	});
}
