import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";
import { isDirectory } from "./fs-helpers";

/**
 * Resolve the global config directory for a Cloudflare CLI.
 *
 * Defaults to wrangler's directory (`.wrangler`) so existing callers are
 * unaffected, but accepts an `appName` so other first-party CLIs (e.g. `cf`)
 * can reuse the same XDG-compliant resolution under their own namespace.
 *
 * @param appName The application namespace, without a leading dot. Defaults to
 * `"wrangler"`.
 * @param useLegacyHomeDir When `true` (the default, matching wrangler's
 * historical behaviour), a pre-existing `~/.<appName>` directory takes
 * precedence over the XDG path. Pass `false` to always use the XDG-compliant
 * path (e.g. a brand-new CLI with no legacy directory to honour).
 */
export function getGlobalWranglerConfigPath(
	appName = "wrangler",
	useLegacyHomeDir = true
) {
	//TODO: We should implement a custom path --global-config and/or the WRANGLER_HOME type environment variable
	const configDir = xdgAppPaths(`.${appName}`).config(); // New XDG compliant config path

	if (useLegacyHomeDir) {
		const legacyConfigDir = path.join(os.homedir(), `.${appName}`); // Legacy config in user's home directory
		// Check for the legacy directory in $HOME; if it is not there then use the
		// XDG compliant path.
		if (isDirectory(legacyConfigDir)) {
			return legacyConfigDir;
		}
	}

	return configDir;
}
