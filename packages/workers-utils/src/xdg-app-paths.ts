import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";

function isDirectory(configPath: string) {
	try {
		return fs.statSync(configPath).isDirectory();
	} catch {
		// ignore error
		return false;
	}
}

export function getGlobalWranglerConfigPath() {
	const configDir = xdgAppPaths("wrangler").config(); // XDG compliant config path
	const configDirDotted = xdgAppPaths(".wrangler").config(); // XDG compliant config path (but with unconventional dotted folder name)
	const legacyConfigDir = path.join(os.homedir(), ".wrangler"); // Legacy config in user's home directory

	if (isDirectory(configDir)) {
		// There is a wrangler directory in the XDG config location just use it.
		return configDir;
	} else if (isDirectory(legacyConfigDir)) {
		// There is a legacy .wrangler directory in the home directory.
		// Try to move it to the non-legacy location or just use it if that is not possible.
		try {
			fs.mkdirSync(path.dirname(configDir), { recursive: true });
			fs.renameSync(legacyConfigDir, configDir);
			return configDir;
		} catch {
			return legacyConfigDir;
		}
	} else if (isDirectory(configDirDotted)) {
		// There is a .wrangler directory in the XDG config location.
		// Try to move it to the non-dotted location or just use it if that is not possible.
		try {
			fs.mkdirSync(path.dirname(configDir), { recursive: true });
			fs.renameSync(configDirDotted, configDir);
			return configDir;
		} catch {
			return configDirDotted;
		}
	} else {
		return configDir;
	}
}

export function getGlobalWranglerCachePath() {
	const cacheDir = xdgAppPaths("wrangler").cache(); // XDG compliant cache path
	const cacheDirDotted = xdgAppPaths(".wrangler").cache(); // XDG compliant cache path (but with unconventional dotted folder name)

	if (isDirectory(cacheDir)) {
		// There is a wrangler directory in the XDG cache location just use it.
		return cacheDir;
	} else if (isDirectory(cacheDirDotted)) {
		// There is a .wrangler directory in the XDG cache location.
		// Try to move it to the non-dotted location or just use it if that is not possible.
		try {
			fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
			fs.renameSync(cacheDirDotted, cacheDir);
			return cacheDir;
		} catch {
			return cacheDirDotted;
		}
	} else {
		return cacheDir;
	}
}
