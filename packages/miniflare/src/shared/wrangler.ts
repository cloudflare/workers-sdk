import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";

function isDirectory(configPath: string) {
	return (
		fs.statSync(configPath, { throwIfNoEntry: false })?.isDirectory() ?? false
	);
}

export function getGlobalWranglerConfigPath() {
	//TODO: We should implement a custom path --global-config and/or the WRANGLER_HOME type environment variable
	const brokenConfigDir = xdgAppPaths(".wrangler").config(); // ~/.config/.wrangler/ (incorrect — from versions with this bug)
	const configDir = xdgAppPaths("wrangler").config(); // Correct XDG-compliant config path
	const legacyConfigDir = path.join(os.homedir(), ".wrangler"); // Legacy config in user's home directory

	// Check for the .wrangler directory in root if it is not there then use the XDG compliant path.
	if (isDirectory(legacyConfigDir)) {
		return legacyConfigDir;
	}

	// Migrate from the previously-buggy hidden-in-.config path
	if (isDirectory(brokenConfigDir) && !isDirectory(configDir)) {
		try {
			fs.renameSync(brokenConfigDir, configDir);
		} catch {
			// Another process may have completed the migration first.
			// If the new path exists now, prefer it; otherwise fall back
			// to the broken path to avoid data loss.
			if (isDirectory(configDir)) {
				return configDir;
			}
			return brokenConfigDir;
		}
	}

	return configDir;
}

export function getGlobalWranglerCachePath() {
	const brokenCacheDir = xdgAppPaths(".wrangler").cache(); // ~/.cache/.wrangler/ (incorrect — from versions with this bug)
	const cacheDir = xdgAppPaths("wrangler").cache(); // Correct XDG-compliant cache path

	if (isDirectory(brokenCacheDir) && !isDirectory(cacheDir)) {
		try {
			fs.renameSync(brokenCacheDir, cacheDir);
		} catch {
			if (isDirectory(cacheDir)) {
				return cacheDir;
			}
			return brokenCacheDir;
		}
	}

	return cacheDir;
}
