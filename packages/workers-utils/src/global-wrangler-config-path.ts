import { renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";
import { isDirectory } from "./fs-helpers";

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
			renameSync(brokenConfigDir, configDir);
		} catch {
			// If rename fails, use the broken path to avoid data loss
			return brokenConfigDir;
		}
	}

	return configDir;
}
