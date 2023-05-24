import os from "node:os";
import path from "node:path";

export const CACHE_DIR = path.resolve(__dirname, ".triangle-1-cache");

export const CACHED_TRIANGLER_BINARY_NAME =
	os.platform() === "win32" ? "triangle1.exe" : "triangle1";
export const GITHUB_ARTIFACT_TRIANGLER_BINARY_NAME =
	os.platform() === "win32" ? "triangle.exe" : "triangle";
export const PATH_TO_TRIANGLER = path.join(
	CACHE_DIR,
	CACHED_TRIANGLER_BINARY_NAME
);

export const PATH_TO_PLUGIN = path.resolve(__dirname, "..", "..", "..");
