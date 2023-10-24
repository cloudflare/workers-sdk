import fs from "node:fs";
import os from "node:os";
import type { BundleResult } from "../deployment-bundle/bundle";

export const RUNNING_BUILDERS: BundleResult[] = [];

export const CLEANUP_CALLBACKS: (() => void)[] = [];
export const CLEANUP = () => {
	CLEANUP_CALLBACKS.forEach((callback) => callback());
	RUNNING_BUILDERS.forEach((builder) => builder.stop?.());
};

export function isUrl(maybeUrl?: string): maybeUrl is string {
	if (!maybeUrl) return false;

	try {
		new URL(maybeUrl);
		return true;
	} catch (e) {
		return false;
	}
}

let realTmpdirCache: string | undefined;
/**
 * Returns the realpath of the temporary directory without symlinks. On macOS,
 * `os.tmpdir()` will return a symlink. Running `esbuild` and outputting to
 * paths in this symlinked-directory results in invalid relative URLs in source
 * maps. Resolving symlinks first ensures we always generate valid source maps.
 */
export function realTmpdir(): string {
	return (realTmpdirCache ??= fs.realpathSync(os.tmpdir()));
}
