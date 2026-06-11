import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";
import { isDirectory } from "./fs-helpers";

export interface GetGlobalConfigPathOptions {
	/**
	 * The application namespace. Defaults to `"wrangler"`.
	 */
	appName?: string;
	/**
	 * Whether to prepend a `.` to `appName` when resolving the XDG path and the
	 * legacy `$HOME` directory. Defaults to `true` to match wrangler's
	 * historical behaviour (`.wrangler`).
	 */
	leadingDot?: boolean;
	/**
	 * When `true` (the default, matching wrangler's historical behaviour), a
	 * pre-existing `~/.<appName>` directory takes precedence over the XDG path.
	 * Pass `false` to always use the XDG-compliant path.
	 */
	useLegacyHomeDir?: boolean;
}

/**
 * Resolve the global config directory for a Cloudflare CLI.
 *
 * Defaults to wrangler's directory (`.wrangler`) so existing callers are
 * unaffected, but accepts an `appName` so other first-party CLIs (e.g. `cf`)
 * can reuse the same XDG-compliant resolution under their own namespace.
 */
export function getGlobalConfigPath({
	appName = "wrangler",
	leadingDot = true,
	useLegacyHomeDir = true,
}: GetGlobalConfigPathOptions = {}) {
	//TODO: We should implement a custom path --global-config and/or the WRANGLER_HOME type environment variable
	const dirName = `${leadingDot ? "." : ""}${appName}`;
	const configDir = xdgAppPaths(dirName).config(); // New XDG compliant config path

	if (useLegacyHomeDir) {
		const legacyConfigDir = path.join(os.homedir(), dirName); // Legacy config in user's home directory
		// Check for the legacy directory in $HOME; if it is not there then use the
		// XDG compliant path.
		if (isDirectory(legacyConfigDir)) {
			return legacyConfigDir;
		}
	}

	return configDir;
}

/**
 * @deprecated Use {@link getGlobalConfigPath} instead.
 */
export function getGlobalWranglerConfigPath() {
	return getGlobalConfigPath();
}
