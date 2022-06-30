import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";

export function getConfigPath() {
	//TODO: We should implement a custom path --global-config
	const configDir = xdgAppPaths(".wrangler").config(); // new XDG compliant config path
	const legacyConfigDir = path.join(homedir(), ".wrangler"); // legacy config in user's home directory

	function isDirectory(configPath: string) {
		try {
			return statSync(configPath).isDirectory();
		} catch (error) {
			// ignore error
			return false;
		}
	}
	// Check for the .wrangler directory in root or in other possible XDG compliant paths,
	// If it does not exist, use the XDG path compliant .wrangler directory.
	if (isDirectory(legacyConfigDir)) {
		return legacyConfigDir;
	} else {
		return configDir;
	}
}
