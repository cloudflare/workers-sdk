import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { getWranglerCacheDirFromEnv } from "@cloudflare/workers-utils";
import { findUpSync } from "find-up";
import { isNonInteractiveOrCI } from "./is-interactive";
import { logger } from "./logger";

let cacheMessageShown = false;

/**
 * Determines the cache folder location using the following priority:
 * 1. WRANGLER_CACHE_DIR environment variable (explicit override)
 * 2. Existing node_modules/.cache/wrangler directory (backward compatibility)
 * 3. Existing .wrangler/cache directory
 * 4. node_modules/.cache/wrangler if node_modules exists
 * 5. .wrangler/cache as final fallback
 */
export function getCacheFolder(): string {
	// Priority 1: Explicit environment variable
	const envCacheDir = getWranglerCacheDirFromEnv();
	if (envCacheDir) {
		return envCacheDir;
	}

	// Find node_modules using existing find-up logic
	const closestNodeModulesDirectory = findUpSync("node_modules", {
		type: "directory",
	});

	const nodeModulesCache = closestNodeModulesDirectory
		? path.join(closestNodeModulesDirectory, ".cache", "wrangler")
		: null;

	const wranglerCache = path.join(process.cwd(), ".wrangler", "cache");

	// Priority 2: Use existing node_modules cache if present
	if (nodeModulesCache && existsSync(nodeModulesCache)) {
		return nodeModulesCache;
	}

	// Priority 3: Use existing .wrangler/cache if present
	if (existsSync(wranglerCache)) {
		return wranglerCache;
	}

	// Priority 4: Create in node_modules if it exists
	if (nodeModulesCache) {
		return nodeModulesCache;
	}

	// Priority 5: Fall back to .wrangler/cache
	return wranglerCache;
}

const arrayFormatter = new Intl.ListFormat("en-US", {
	style: "long",
	type: "conjunction",
});

function showCacheMessage(fields: string[], folder: string) {
	if (!cacheMessageShown && !isNonInteractiveOrCI()) {
		if (fields.length > 0) {
			logger.debug(
				`Retrieving cached values for ${arrayFormatter.format(
					fields
				)} from ${path.relative(process.cwd(), folder)}`
			);
			cacheMessageShown = true;
		}
	}
}

export function getConfigCache<T>(fileName: string): Partial<T> {
	try {
		const cacheFolder = getCacheFolder();
		const configCacheLocation = path.join(cacheFolder, fileName);
		const configCache = JSON.parse(readFileSync(configCacheLocation, "utf-8"));
		showCacheMessage(Object.keys(configCache), cacheFolder);
		return configCache;
	} catch {
		return {};
	}
}

export function saveToConfigCache<T>(
	fileName: string,
	newValues: Partial<T>
): void {
	const cacheFolder = getCacheFolder();
	if (cacheFolder) {
		logger.debug(`Saving to cache: ${JSON.stringify(newValues)}`);
		const configCacheLocation = path.join(cacheFolder, fileName);
		const existingValues = getConfigCache(fileName);

		mkdirSync(path.dirname(configCacheLocation), { recursive: true });
		writeFileSync(
			configCacheLocation,
			JSON.stringify({ ...existingValues, ...newValues }, null, 2)
		);
	}
}

export function purgeConfigCaches() {
	const cacheFolder = getCacheFolder();
	if (cacheFolder) {
		rmSync(cacheFolder, { recursive: true, force: true });
	}
}
