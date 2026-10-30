import fs from "node:fs";
import path from "node:path";
import type { TestProject } from "vitest/node";

// User worker names must not start with this
export const WORKER_NAME_PREFIX = "vitest-plugin-";

export function isFileNotFoundError(e: unknown): boolean {
	return (
		typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT"
	);
}

/**
 * Isolated `node_modules` layouts (e.g. pnpm) link a package's own dependencies
 * only next to its real path, so with `resolve.preserveSymlinks` packages must
 * still use real paths. Links out of `node_modules` (e.g. `npm link`) keep their
 * symlinked paths, so they still resolve peer dependencies from the project.
 */
export function realPackagePath(id: string): string {
	if (!path.isAbsolute(id) || !id.includes("/node_modules/")) {
		return id;
	}
	const queryIndex = id.indexOf("?");
	const hashIndex = id.indexOf("#");
	const files = [queryIndex === -1 ? id : id.slice(0, queryIndex)];
	// Like Vite, try `#` as part of the file name first, then as a fragment.
	if (hashIndex !== -1 && (queryIndex === -1 || hashIndex < queryIndex)) {
		files.push(id.slice(0, hashIndex));
	}
	for (const file of files) {
		try {
			// Unlike `node:fs/promises` and native realpath, `fs.realpathSync` honours
			// fs patches such as Bazel's rules_js sandbox, and keeps mapped drive letters.
			const realFile = fs.realpathSync(file).split(path.sep).join("/");
			return realFile.includes("/node_modules/")
				? realFile + id.slice(file.length)
				: id;
		} catch (e) {
			if (!isFileNotFoundError(e)) {
				throw e;
			}
		}
	}
	return id;
}

export function getProjectPath(project: TestProject): string {
	return project.config.root;
}

export function getRelativeProjectPath(project: TestProject): string {
	const projectPath = getProjectPath(project);
	return path.relative("", projectPath);
}

export function getRelativeProjectConfigPath(project: TestProject): string {
	return project.config.config
		? path.relative("", project.config.config)
		: getRelativeProjectPath(project);
}
