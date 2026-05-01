// Copied from packages/wrangler/src/global-wrangler-config-path.ts with no modification
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
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
	const legacyConfigDir = nodePath.join(os.homedir(), ".wrangler"); // Legacy config in user's home directory

	// Check for the .wrangler directory in root if it is not there then use the XDG compliant path.
	if (isDirectory(legacyConfigDir)) {
		return legacyConfigDir;
	}

	// Migrate from the previously-buggy hidden-in-.config path
	if (isDirectory(brokenConfigDir) && !isDirectory(configDir)) {
		try {
			fs.renameSync(brokenConfigDir, configDir);
		} catch {
			// If rename fails, use the broken path to avoid data loss
			return brokenConfigDir;
		}
	}

	return configDir;
}
