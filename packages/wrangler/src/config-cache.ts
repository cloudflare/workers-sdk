import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { findUpSync } from "find-up";
import { isNonInteractiveOrCI } from "./is-interactive";
import { logger } from "./logger";
import { getWranglerHiddenDirPath } from "./paths";

let cacheMessageShown = false;

// Only used internally for disabling caching during tests
export function disableConfigCache() {
	__cacheFolder = null;
}

let __cacheFolder: string | null | undefined;
function getCacheFolder() {
	if (__cacheFolder || __cacheFolder === null) {
		return __cacheFolder;
	}

	const closestNodeModulesDirectory = findUpSync("node_modules", {
		type: "directory",
	});

	if (closestNodeModulesDirectory) {
		__cacheFolder = path.join(closestNodeModulesDirectory, ".cache/wrangler");
	} else {
		// Fall back to the project-level .wrangler folder when no node_modules is found
		// (e.g., when running via npx wrangler)
		__cacheFolder = path.join(getWranglerHiddenDirPath(undefined), "cache");
	}

	return __cacheFolder;
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
		if (cacheFolder) {
			const configCacheLocation = path.join(cacheFolder, fileName);
			const configCache = JSON.parse(
				readFileSync(configCacheLocation, "utf-8")
			);
			showCacheMessage(Object.keys(configCache), cacheFolder);
			return configCache;
		} else {
			return {};
		}
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
	__cacheFolder = undefined;
}
