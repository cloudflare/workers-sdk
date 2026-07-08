/**
 * Canonical path definitions for the local explorer.
 *
 * These mirror the values in packages/miniflare/src/workers/core/constants.ts
 * but cannot be imported directly due to circular dependency
 * (miniflare depends on @cloudflare/local-explorer-ui).
 */
export const LOCAL_EXPLORER_BASE_PATH = "/cdn-cgi/local/explorer";
export const LOCAL_EXPLORER_API_PATH = `${LOCAL_EXPLORER_BASE_PATH}/api`;
