import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as find from "empathic/find";
import { getWranglerCacheDirFromEnv } from "./environment-variables/misc-variables";
import { removeDirSync } from "./fs-helpers";
import { isNonInteractiveOrCI } from "./is-interactive";
import type { Logger } from "./logger";

/**
 * A file-backed key/value cache scoped to a consumer's cache directory.
 *
 * The mechanism is generic (JSON blobs keyed by file name); the only
 * consumer-specific input is the logger used for debug output, so the whole
 * bundle is built by {@link createConfigCache}. Wrangler wraps this with its
 * logger singleton in `src/config-cache.ts`; `@cloudflare/workers-auth` builds
 * its own instance with the logger injected into `createWranglerAuth`.
 */
export interface ConfigCache {
	getCacheFolder: () => string;
	getConfigCache: <T>(fileName: string) => Partial<T>;
	saveToConfigCache: <T>(fileName: string, newValues: Partial<T>) => void;
	purgeConfigCaches: () => void;
}

export interface ConfigCacheOptions {
	/**
	 * Namespace for the cache directory, so different Cloudflare CLIs get
	 * isolated caches (`<node_modules>/.cache/<namespace>` or
	 * `.<namespace>/cache`). Defaults to `"wrangler"` for backward compatibility.
	 *
	 * `purgeConfigCaches()` deletes the whole cache folder, so a non-default
	 * namespace also ensures e.g. `cf login`/`logout` never wipes wrangler's
	 * cache.
	 */
	namespace?: string;
}

const arrayFormatter = new Intl.ListFormat("en-US", {
	style: "long",
	type: "conjunction",
});

/**
 * Build a file-backed config cache bound to the given logger.
 */
export function createConfigCache(
	logger: Logger,
	options?: ConfigCacheOptions
): ConfigCache {
	let cacheMessageShown = false;
	const namespace = options?.namespace ?? "wrangler";

	/**
	 * Determines the cache folder location using the following priority:
	 * 1. WRANGLER_CACHE_DIR environment variable (wrangler namespace only)
	 * 2. Existing <node_modules>/.cache/<namespace> directory (backward compatibility)
	 * 3. Existing .<namespace>/cache directory
	 * 4. <node_modules>/.cache/<namespace> if node_modules exists
	 * 5. .<namespace>/cache as final fallback
	 */
	function getCacheFolder(): string {
		// Priority 1: Explicit environment variable. WRANGLER_CACHE_DIR is a
		// wrangler-specific override, so only the wrangler namespace honours it;
		// other CLIs get their own isolated cache dir instead of being redirected
		// into wrangler's.
		if (namespace === "wrangler") {
			const envCacheDir = getWranglerCacheDirFromEnv();
			if (envCacheDir) {
				return envCacheDir;
			}
		}

		// Find node_modules using existing find-up logic
		const closestNodeModulesDirectory = find.dir("node_modules");

		const nodeModulesCache = closestNodeModulesDirectory
			? path.join(closestNodeModulesDirectory, ".cache", namespace)
			: null;

		const localCache = path.join(process.cwd(), `.${namespace}`, "cache");

		// Priority 2: Use existing node_modules cache if present
		if (nodeModulesCache && existsSync(nodeModulesCache)) {
			return nodeModulesCache;
		}

		// Priority 3: Use existing .<namespace>/cache if present
		if (existsSync(localCache)) {
			return localCache;
		}

		// Priority 4: Create in node_modules if it exists
		if (nodeModulesCache) {
			return nodeModulesCache;
		}

		// Priority 5: Fall back to .<namespace>/cache
		return localCache;
	}

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

	function getConfigCache<T>(fileName: string): Partial<T> {
		try {
			const cacheFolder = getCacheFolder();
			const configCacheLocation = path.join(cacheFolder, fileName);
			const configCache = JSON.parse(
				readFileSync(configCacheLocation, "utf-8")
			);
			showCacheMessage(Object.keys(configCache), cacheFolder);
			return configCache;
		} catch {
			return {};
		}
	}

	function saveToConfigCache<T>(fileName: string, newValues: Partial<T>): void {
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

	function purgeConfigCaches() {
		const cacheFolder = getCacheFolder();
		if (cacheFolder) {
			removeDirSync(cacheFolder);
		}
	}

	return {
		getCacheFolder,
		getConfigCache,
		saveToConfigCache,
		purgeConfigCaches,
	};
}
