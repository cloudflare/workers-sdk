import { createConfigCache } from "@cloudflare/workers-utils";
import { logger } from "./logger";

// The config-cache mechanism is generic file-backed storage and now lives in
// `@cloudflare/workers-utils` as `createConfigCache(logger)`, so both wrangler
// and `@cloudflare/workers-auth` can build their own instances. This binds
// wrangler's logger singleton and re-exports the bound helpers so wrangler's
// existing `from "./config-cache"` import paths keep working unchanged.
const configCache = createConfigCache(logger);

export const getCacheFolder = configCache.getCacheFolder;
export const getConfigCache = configCache.getConfigCache;
export const saveToConfigCache = configCache.saveToConfigCache;
export const purgeConfigCaches = configCache.purgeConfigCaches;
