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

/**
 * Get the global Wrangler configuration directory path.
 * Priority order:
 * 1. WRANGLER_HOME environment variable (if set)
 * 2. ~/.wrangler/ (legacy, if exists)
 * 3. XDG-compliant path (default)
 *
 * @returns The path to the global Wrangler configuration directory
 */
export function getGlobalWranglerConfigPath(): string {
	// Check for WRANGLER_HOME environment variable first
	const wranglerHome = process.env.WRANGLER_HOME;
	if (wranglerHome) {
		return wranglerHome;
	}

	const configDir = xdgAppPaths(".wrangler").config(); // New XDG compliant config path
	const legacyConfigDir = path.join(os.homedir(), ".wrangler"); // Legacy config in user's home directory

	// Check for the .wrangler directory in root if it is not there then use the XDG compliant path.
	if (isDirectory(legacyConfigDir)) {
		return legacyConfigDir;
	} else {
		return configDir;
	}
}

/**
 * Find the project root directory by searching upward for project markers.
 * Looks for: wrangler.toml, wrangler.json, wrangler.jsonc, package.json, or .git directory
 *
 * @param startDir The directory to start searching from (defaults to current working directory)
 * @returns The project root directory path, or undefined if not found
 */
export function findProjectRoot(startDir: string = process.cwd()): string | undefined {
	const projectMarkers = [
		"wrangler.toml",
		"wrangler.json",
		"wrangler.jsonc",
		"package.json",
		".git",
	];

	let currentDir = path.resolve(startDir);
	const rootDir = path.parse(currentDir).root;

	while (currentDir !== rootDir) {
		// Check if any project marker exists in current directory
		for (const marker of projectMarkers) {
			const markerPath = path.join(currentDir, marker);
			if (fs.existsSync(markerPath)) {
				return currentDir;
			}
		}

		// Move up one directory
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break; // Reached the root
		}
		currentDir = parentDir;
	}

	return undefined;
}

/**
 * Get the local (project-specific) Wrangler configuration directory path.
 * Searches for a .wrangler directory in the current directory or project root.
 *
 * @param projectRoot Optional project root directory (will be auto-detected if not provided)
 * @returns The path to the local .wrangler directory, or undefined if not found
 */
export function getLocalWranglerConfigPath(projectRoot?: string): string | undefined {
	// First, check current directory
	const cwdWrangler = path.join(process.cwd(), ".wrangler");
	if (isDirectory(cwdWrangler)) {
		return cwdWrangler;
	}

	// If not provided, find the project root
	const root = projectRoot ?? findProjectRoot();
	if (!root) {
		return undefined;
	}

	const localWranglerPath = path.join(root, ".wrangler");
	if (isDirectory(localWranglerPath)) {
		return localWranglerPath;
	}

	return undefined;
}

export function getGlobalWranglerCachePath() {
	return xdgAppPaths(".wrangler").cache();
}
