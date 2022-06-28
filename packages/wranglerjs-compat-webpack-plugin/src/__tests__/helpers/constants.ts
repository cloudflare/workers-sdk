import os from "node:os";
import path from "node:path";

export const CACHE_DIR = path.resolve(__dirname, ".wrangler-1-cache");

export const CACHED_WRANGLER_BINARY_NAME =
	os.platform() === "win32" ? "wrangler1.exe" : "wrangler1";
export const GITHUB_ARTIFACT_WRANGLER_BINARY_NAME =
	os.platform() === "win32" ? "wrangler.exe" : "wrangler";
export const PATH_TO_WRANGLER = path.join(
	CACHE_DIR,
	CACHED_WRANGLER_BINARY_NAME
);

export const PATH_TO_PLUGIN = path.resolve(__dirname, "..", "..", "..");
