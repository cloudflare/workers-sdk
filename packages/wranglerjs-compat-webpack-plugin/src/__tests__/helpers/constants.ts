import path from "node:path";

/**
 * Points to project-root/node_modules/.cache
 */
export const CACHE_DIR = path.resolve(
  __dirname,
  "../",
  "../",
  "../",
  "../",
  "../",
  "node_modules",
  ".cache"
);

export const PATH_TO_WRANGLER = path.join(CACHE_DIR, "wrangler1");
