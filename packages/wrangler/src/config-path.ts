import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";

export function getConfigPath() {
	//TODO: We should implement a custom path --global-config
	const configDir = xdgAppPaths(".wrangler").config(); // New XDG compliant config path
	const legacyConfigDir = path.join(os.homedir(), ".wrangler"); // Legacy config in user's home directory

	function isDirectory(configPath: string) {
		try {
			return fs.statSync(configPath).isDirectory();
		} catch (error) {
			// ignore error
			return false;
		}
	}
	// Check for the .wrangler directory in root if it is not then use the XDG compliant path.
	if (isDirectory(legacyConfigDir)) {
		return legacyConfigDir;
	} else {
		return configDir;
	}
}
