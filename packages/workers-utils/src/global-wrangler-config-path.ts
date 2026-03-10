import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";
import { isDirectory } from "./fs-helpers";

export function getGlobalWranglerConfigPath() {
	//TODO: We should implement a custom path --global-config and/or the WRANGLER_HOME type environment variable
	const configDir = xdgAppPaths(".wrangler").config(); // New XDG compliant config path
	const legacyConfigDir = path.join(os.homedir(), ".wrangler"); // Legacy config in user's home directory

	// Check for the .wrangler directory in root if it is not there then use the XDG compliant path.
	if (isDirectory(legacyConfigDir)) {
		return legacyConfigDir;
	} else {
		return configDir;
	}
}
