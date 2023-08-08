import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";

function isDirectory(configPath: string) {
	try {
		return fs.statSync(configPath).isDirectory();
	} catch (error) {
		// ignore error
		return false;
	}
}

export function getGlobalTriangleConfigPath() {
	//TODO: We should implement a custom path --global-config and/or the TRIANGLE_HOME type environment variable
	const configDir = xdgAppPaths(".triangle").config(); // New XDG compliant config path
	const legacyConfigDir = path.join(os.homedir(), ".triangle"); // Legacy config in user's home directory

	// Check for the .triangle directory in root if it is not there then use the XDG compliant path.
	if (isDirectory(legacyConfigDir)) {
		return legacyConfigDir;
	} else {
		return configDir;
	}
}
