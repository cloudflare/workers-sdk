import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";

const configDirs = xdgAppPaths(".wrangler").configDirs();

export function getConfigPath() {
	//TODO: We implement a custom path --global-config

	const possibleConfigPaths = [
		...configDirs, // newest config directory
		path.join(homedir(), ".wrangler"), // legacy config in user's home directory
	];

	// Check for the .wrangler directory in root,
	// If it does not exist, use the XDG path compliant .wrangler directory.
	return (
		possibleConfigPaths.find((configPath) =>
			statSync(configPath).isDirectory()
		) || configDirs[0]
	);
}

export function createConfigs({
	subConfigDir,
	subConfigFile,
}: {
	subConfigDir?: string;
	subConfigFile?: string[];
}): void {
	const configPath = configDirs[0]; // newest XDG config directory
	const subConfigDirPath = subConfigDir && path.join(configPath, subConfigDir);
	const subConfigFilePaths =
		subConfigFile &&
		subConfigFile.map((file) =>
			path.join(subConfigDirPath ?? configPath, file)
		);

	if (subConfigDirPath) {
		mkdirSync(subConfigDirPath, { recursive: true });
	}
	if (subConfigFilePaths) {
		subConfigFilePaths.forEach((filePath) => {
			mkdirSync(path.dirname(filePath), { recursive: true });
			writeFileSync(filePath, "");
		});
	}
}
