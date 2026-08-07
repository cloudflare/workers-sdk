import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	getInstalledPackageVersion,
	parsePackageJSON,
} from "@cloudflare/workers-utils";
import * as find from "empathic/find";
import { logger } from "../../shared/context";

/**
 * A single npm package dependency entry, matching the upload API schema
 * see: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update.
 */
export type PackageDependency = {
	/** The npm package name, e.g. "lodash" or "@cloudflare/workers-types". */
	name: string;
	/** The version constraint as written in package.json, e.g. "^4.17.21". */
	packageJsonVersion: string;
	/** The exact version resolved and installed by the package manager, e.g. "4.17.22". */
	installedVersion: string;
};

/**
 * Maximum number of dependency entries to include in a single upload.
 * This also gets truncated to this limit server-side, but we cap client-side
 * to avoid sending unnecessarily large payloads.
 */
const MAX_PACKAGE_DEPENDENCIES = 200;

/** Filename used for the cached dependency results. */
const CACHE_FILENAME = "package-dependencies.json";

/**
 * Lockfile names to look for when computing the cache key.
 * Checked in order; the first match wins.
 */
const KNOWN_LOCKFILES = [
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
] as const;

/**
 * Shape of the on-disk cache file written to the caller-supplied cache directory.
 */
type PackageDependenciesCache = {
	/** SHA-256 hex digest of the project's package.json content. */
	packageJsonHash: string;
	/** SHA-256 hex digest of the lockfile content, or `null` if none was found. */
	lockfileHash: string | null;
	/** Absolute path of the lockfile that was hashed, or `null` if none. */
	lockfilePath: string | null;
	/** The collected dependency entries. */
	dependencies: PackageDependency[];
};

/**
 * Computes the SHA-256 hex digest of a buffer or string.
 *
 * @param content - The content to hash
 * @returns The hex-encoded SHA-256 digest
 */
function sha256(content: Buffer | string): string {
	return createHash("sha256").update(content).digest("hex");
}

/**
 * Searches for the first known lockfile starting at `projectPath` and walking
 * up parent directories toward the filesystem root. This ensures lockfiles at
 * a monorepo/workspace root are detected even when the Worker lives in a
 * sub-package.
 *
 * @param projectPath - The project directory to start searching from
 * @returns An object with the lockfile's absolute `filePath` and its content `hash`,
 *          or `null` if no lockfile is found
 */
async function getLockfileInfo(
	projectPath: string
): Promise<{ filePath: string; hash: string } | null> {
	for (const name of KNOWN_LOCKFILES) {
		const filePath = find.file(name, { cwd: projectPath });
		if (filePath) {
			const content = await readFile(filePath);
			return { filePath, hash: sha256(content) };
		}
	}
	return null;
}

/**
 * Validates that a parsed JSON value conforms to the {@link PackageDependenciesCache} shape.
 * Returns `false` if any field is missing or has the wrong type, causing the
 * entire cache to be discarded.
 *
 * @param value - The parsed JSON value to validate
 * @returns `true` if the value matches the expected cache structure, `false` otherwise
 */
function isValidDependenciesCache(
	value: unknown
): value is PackageDependenciesCache {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	if (typeof obj.packageJsonHash !== "string") {
		return false;
	}
	if (obj.lockfileHash !== null && typeof obj.lockfileHash !== "string") {
		return false;
	}
	if (obj.lockfilePath !== null && typeof obj.lockfilePath !== "string") {
		return false;
	}
	if (!Array.isArray(obj.dependencies)) {
		return false;
	}

	for (const dep of obj.dependencies) {
		if (typeof dep !== "object" || dep === null || Array.isArray(dep)) {
			return false;
		}
		const d = dep as Record<string, unknown>;
		if (
			typeof d.name !== "string" ||
			typeof d.packageJsonVersion !== "string" ||
			typeof d.installedVersion !== "string"
		) {
			return false;
		}
	}

	return true;
}

/**
 * Attempts to read a previously-written cache file.
 *
 * @param cachePath - Full path to the cache JSON file
 * @returns The parsed cache contents, or `null` if the file is missing or malformed
 */
async function readDependenciesCache(
	cachePath: string
): Promise<PackageDependenciesCache | null> {
	try {
		const raw = await readFile(cachePath, "utf-8");
		const parsed: unknown = JSON.parse(raw);

		if (!isValidDependenciesCache(parsed)) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

/**
 * Writes the dependency cache to disk (best-effort; failures are silently ignored).
 *
 * @param cachePath - Full path to the cache JSON file
 * @param data - The cache payload to persist
 */
async function writeDependenciesCache(
	cachePath: string,
	data: PackageDependenciesCache
): Promise<void> {
	try {
		await mkdir(path.dirname(cachePath), { recursive: true });
		await writeFile(cachePath, JSON.stringify(data, null, 2));
	} catch {
		// best-effort — a failure to write cache should never block a deploy
	}
}

/**
 * Converts a glob pattern (supporting `*` wildcards) to a regular expression.
 *
 * The `*` character matches any sequence of characters. All other regex-special
 * characters in the pattern are escaped.
 *
 * @param pattern - A glob-style pattern, e.g. `"@internal/*"` or `"*-utils"`
 * @returns A `RegExp` that matches strings against the given pattern
 */
function globPatternToRegExp(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
	const regexStr = escaped.replace(/\*/g, ".*");
	return new RegExp(`^${regexStr}$`);
}

/**
 * Tests whether a package name matches any of the given exclusion patterns.
 *
 * @param name - The package name to test
 * @param excludePatterns - An array of glob patterns to match against
 * @returns `true` if the name matches at least one pattern
 */
function isExcludedPackage(name: string, excludePatterns: string[]): boolean {
	return excludePatterns.some((pattern) =>
		globPatternToRegExp(pattern).test(name)
	);
}

/**
 * Collects npm package dependency metadata from the project's package.json.
 *
 * Reads both `dependencies` and `devDependencies`, resolves each package's
 * installed version from node_modules, and filters out:
 * - Workspace packages (version prefixed with `workspace:`)
 * - Pnpm catalog packages (version prefixed with `catalog:`)
 * - Local packages (version prefixed with `file:` or `link:`)
 * - Packages whose installed version cannot be resolved
 * - Packages matching any pattern in `excludePackages`
 *
 * The result is capped at {@link MAX_PACKAGE_DEPENDENCIES} entries.
 *
 * When `opts.cacheDir` is provided the results are cached to disk and reused
 * on subsequent calls as long as neither `package.json` nor the project's
 * lockfile have been modified (compared by content hash).
 *
 * @param projectPath - Path to the project directory (where package.json is located)
 * @param opts - Optional settings
 * @param opts.excludePackages - Optional list of package name patterns (glob-style with
 *        `*` wildcards) to exclude from the collected dependencies
 * @param opts.cacheDir - Directory to store the cache file. If omitted, caching is disabled.
 * @returns An array of package dependency entries, or `undefined` if package.json
 *          cannot be read or no valid dependencies are found
 */
export async function collectPackageDependencies(
	projectPath: string,
	opts?: {
		excludePackages?: string[];
		cacheDir?: string;
	}
): Promise<PackageDependency[] | undefined> {
	const packageJsonPath = path.join(projectPath, "package.json");

	try {
		await access(packageJsonPath);
	} catch {
		return undefined;
	}

	try {
		const packageJsonContent = await readFile(packageJsonPath, "utf-8");

		const cachePath = opts?.cacheDir
			? path.join(opts.cacheDir, CACHE_FILENAME)
			: null;

		// Only compute hashes and resolve lockfile info when caching is enabled,
		// to avoid unnecessary filesystem I/O (directory walks and large file
		// reads) when cacheDir is not provided.
		const packageJsonHash = cachePath ? sha256(packageJsonContent) : undefined;
		const lockfileInfo = cachePath
			? await getLockfileInfo(projectPath)
			: undefined;

		if (cachePath && packageJsonHash !== undefined) {
			// Attempt to return cached results when available
			const cached = await readDependenciesCache(cachePath);
			if (
				cached &&
				cached.packageJsonHash === packageJsonHash &&
				cached.lockfileHash === (lockfileInfo?.hash ?? null) &&
				cached.lockfilePath === (lockfileInfo?.filePath ?? null)
			) {
				logger?.debug("Using cached package dependency results");
				return cached.dependencies.length > 0 ? cached.dependencies : undefined;
			}
		}

		const packageJson = parsePackageJSON(packageJsonContent, packageJsonPath);

		const allDependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		} as Record<string, string>;

		const result: PackageDependency[] = [];

		for (const [dependencyName, packageJsonVersion] of Object.entries(
			allDependencies
		)) {
			if (result.length >= MAX_PACKAGE_DEPENDENCIES) {
				break;
			}

			if (
				packageJsonVersion.startsWith("workspace:") ||
				packageJsonVersion.startsWith("catalog:") ||
				packageJsonVersion.startsWith("file:") ||
				packageJsonVersion.startsWith("link:")
			) {
				continue;
			}

			if (
				opts?.excludePackages?.length &&
				isExcludedPackage(dependencyName, opts.excludePackages)
			) {
				continue;
			}

			const installedVersion = getInstalledPackageVersion(
				dependencyName,
				projectPath
			);

			if (!installedVersion) {
				continue;
			}

			result.push({
				name: dependencyName,
				packageJsonVersion,
				installedVersion,
			});
		}

		// Persist the cache for future calls
		if (cachePath && packageJsonHash !== undefined) {
			await writeDependenciesCache(cachePath, {
				packageJsonHash,
				lockfileHash: lockfileInfo?.hash ?? null,
				lockfilePath: lockfileInfo?.filePath ?? null,
				dependencies: result,
			});
		}

		return result.length > 0 ? result : undefined;
	} catch (error) {
		logger?.debug(
			`Failed to collect package dependencies: ${error instanceof Error ? error.message : error}`
		);
		return undefined;
	}
}
