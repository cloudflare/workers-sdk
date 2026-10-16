import fs from "node:fs";
import path from "node:path";
import { Minimatch } from "minimatch";

const DEFAULT_MIGRATIONS_DIR = "./migrations";

export type D1MigrationFile = {
	name: string;
	filePath: string;
};

export type GetD1MigrationFilesOptions = {
	projectPath: string;
	migrationsDir?: string;
	migrationsPattern?: string;
};

/**
 * Discover D1 migration files under `projectPath` using the same glob rules as
 * Wrangler (`migrations_dir` / `migrations_pattern`).
 *
 * @param options.projectPath Directory the glob is resolved against (usually
 * the directory containing the Wrangler config).
 * @param options.migrationsDir Directory of migrations, relative to
 * `projectPath`. Defaults to `./migrations`.
 * @param options.migrationsPattern Glob relative to `projectPath`. Defaults to
 * `${migrationsDir}/*.sql`. Must start with `${migrationsDir}/` unless
 * `migrationsDir` is `"."`.
 * @returns Matching files sorted by {@link compareMigrationPaths}. `name` is
 * the path relative to `migrationsDir` with forward slashes.
 */
export function getD1MigrationFiles(
	options: GetD1MigrationFilesOptions
): D1MigrationFile[] {
	const migrationsDir = normalizeRelativePath(
		options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR
	);
	const migrationsPattern = normalizeRelativePath(
		options.migrationsPattern ?? `${migrationsDir}/*.sql`
	);
	const dirRelativePattern = stripDirPrefix(migrationsPattern, migrationsDir);
	const walkRoot = path.resolve(options.projectPath, migrationsDir);
	const names = listFilesRelative(
		walkRoot,
		new Minimatch(dirRelativePattern, { dot: false })
	);
	return names.map((name) => ({
		name,
		filePath: path.join(walkRoot, ...name.split("/")),
	}));
}

/**
 * Normalize a relative path or glob into a canonical form for string-prefix
 * comparisons:
 *
 *  - Backslashes flipped to forward slashes.
 *  - Leading `./` and `//` runs collapsed (via `path.posix.normalize`).
 *  - Trailing `/` stripped (`normalize("foo/")` keeps it; we don't want it).
 */
export function normalizeRelativePath(p: string): string {
	const forwardSlashed = p.replace(/\\/g, "/");
	const normalized = path.posix.normalize(forwardSlashed);
	if (normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}
	return normalized;
}

/**
 * Rewrite `pattern` relative to `dir` by stripping the `${dir}/` prefix. Both
 * `pattern` and `dir` must already be normalized (see
 * {@link normalizeRelativePath}).
 *
 * Throws if `pattern` is not under `dir`.
 */
function stripDirPrefix(pattern: string, dir: string): string {
	if (dir === ".") {
		return pattern;
	}
	const prefix = `${dir}/`;
	if (!pattern.startsWith(prefix)) {
		throw new Error(
			`Expected migrations pattern ${JSON.stringify(pattern)} to start with ${JSON.stringify(prefix)}`
		);
	}
	return pattern.slice(prefix.length);
}

/**
 * Recursively list regular files under `dir` whose `dir`-relative path
 * matches `matcher` (a `Minimatch` whose pattern is also `dir`-relative).
 *
 * Paths use forward-slash separators (so they match globs the same on POSIX
 * and Windows), sorted by {@link compareMigrationPaths}.
 *
 * Prunes the walk with minimatch's `partial: true` mode: before descending
 * into a subdirectory we ask whether its relative path could be a prefix of
 * something matching `matcher.pattern`. If not, we skip the descent. So a
 * `*.sql` pattern never recurses, `*\/migration.sql` only descends one
 * level, `**\/*.sql` recurses unconditionally.
 */
function listFilesRelative(dir: string, matcher: Minimatch): string[] {
	const out: string[] = [];
	const stack: Array<{ abs: string; rel: string }> = [{ abs: dir, rel: "" }];

	while (stack.length > 0) {
		const { abs, rel } = stack.pop() as { abs: string; rel: string };
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(abs, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
			if (entry.isDirectory()) {
				if (matcher.match(childRel, true /* partial */)) {
					stack.push({ abs: path.join(abs, entry.name), rel: childRel });
				}
			} else if (entry.isFile() && matcher.match(childRel)) {
				out.push(childRel);
			}
		}
	}

	return out.sort(compareMigrationPaths);
}

/**
 * Compare two migration paths by the leading integer of each path
 * segment, falling back to lex order on ties. Numbered files sort before
 * unnumbered ones.
 *
 * Numeric ordering matters for users with inconsistently-padded numeric
 * prefixes (`1_a.sql`, `9_b.sql`, `10_c.sql`); a pure lex sort would put
 * `10_c.sql` between `1_a.sql` and `9_b.sql`.
 */
export function compareMigrationPaths(a: string, b: string): number {
	const aSegments = a.split("/");
	const bSegments = b.split("/");
	const shared = Math.min(aSegments.length, bSegments.length);
	for (let i = 0; i < shared; i++) {
		const aSegment = aSegments[i];
		const bSegment = bSegments[i];
		if (aSegment === undefined || bSegment === undefined) {
			break;
		}
		const cmp = compareSegments(aSegment, bSegment);
		if (cmp !== 0) {
			return cmp;
		}
	}
	// Every shared segment is equal: the shorter path sorts first (e.g.
	// `0001_a` before `0001_a/migration.sql`). This is impossible because
	// listFilesRelative() will never output a directory.
	return aSegments.length - bSegments.length;
}

function compareSegments(a: string, b: string): number {
	const aNum = leadingMigrationNumber(a);
	const bNum = leadingMigrationNumber(b);
	if (aNum !== bNum) {
		// `NaN !== NaN` is true, so unprefixed paths hit this branch. Guard
		// with isFinite to fall through to the lex tiebreaker below.
		if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
			return aNum - bNum;
		}
		// Numbered files sort before unnumbered ones.
		if (Number.isFinite(aNum)) {
			return -1;
		}
		if (Number.isFinite(bNum)) {
			return 1;
		}
	}
	// Same number, or both unnumbered: lex order for determinism.
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

/**
 * Parse the leading integer from a migration's first path segment.
 * - `0001_init.sql` → `1`
 * - `0001_init/migration.sql` → `1` (directory carries the number, as in
 *   drizzle-style layouts)
 * - `init.sql` → `NaN`
 */
function leadingMigrationNumber(relativePath: string): number {
	const firstSegment = relativePath.split("/")[0];
	return parseInt(firstSegment.split("_")[0], 10);
}
