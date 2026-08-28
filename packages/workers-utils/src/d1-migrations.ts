import fs from "node:fs";
import path from "node:path";
import { Minimatch } from "minimatch";

export const DEFAULT_MIGRATION_PATH = "./migrations";
export const DEFAULT_MIGRATION_TABLE = "d1_migrations";

function getDefaultMigrationsPattern(migrationsDir: string) {
	return normalizeRelativePath(`${migrationsDir}/*.sql`);
}

export type MigrationsConfigErrorCode =
	| "MIGRATIONS_PATTERN_REQUIRES_DIR"
	| "MIGRATIONS_PATTERN_OUTSIDE_DIR";

/** A consumer-neutral migration configuration validation error. */
export class MigrationsConfigError extends Error {
	constructor(
		message: string,
		readonly code: MigrationsConfigErrorCode,
		readonly details: {
			migrationsDir?: string;
			migrationsPattern: string;
			suggestedPattern?: string;
		}
	) {
		super(message);
		this.name = "MigrationsConfigError";
	}
}

/** Options for resolving D1 migration configuration. */
export type ResolveMigrationsConfigOptions = {
	/** Directory relative migration paths are resolved from. */
	projectPath: string;
	/** The configured migrations directory. */
	migrationsDir?: string;
	/** The configured migrations glob. */
	migrationsPattern?: string;
	/** The configured migration tracking table name. */
	migrationsTableName?: string;
};

/**
 * Fully-resolved view of the D1 migrations configuration for one binding.
 * Build with {@link resolveMigrationsConfig}.
 *
 * Field invariants:
 *  - `migrationsDir` is normalized (forward slashes, no leading `./`,
 *    no trailing `/`) and not empty. `"."` is the project root — the user
 *    can set it to treat the project directory itself as the migrations dir.
 *  - `migrationsPattern` is normalized in the same way, and is under
 *    `migrationsDir` — i.e. {@link stripDirPrefix} can rewrite it relative
 *    to `migrationsDir` without throwing. (When `migrationsDir` is `"."` the
 *    pattern carries no prefix, since normalization strips any leading `./`.)
 *  - `projectPath` is the base that `migrationsDir` and `migrationsPattern`
 *    resolve against.
 */
export type MigrationsConfig = {
	projectPath: string;
	migrationsDir: string;
	migrationsPattern: string;
	migrationsTableName: string;
};

/**
 * Resolve migration-related configuration for one D1 binding.
 *
 * @param options - The project root and optional migration settings.
 * @returns Normalized migration configuration.
 */
export function resolveMigrationsConfig({
	projectPath,
	migrationsDir: rawDir,
	migrationsPattern: rawPattern,
	migrationsTableName = DEFAULT_MIGRATION_TABLE,
}: ResolveMigrationsConfigOptions): MigrationsConfig {
	if (rawPattern !== undefined && rawDir === undefined) {
		throw new MigrationsConfigError(
			"migrationsPattern requires migrationsDir to be set.",
			"MIGRATIONS_PATTERN_REQUIRES_DIR",
			{ migrationsPattern: rawPattern }
		);
	}

	const migrationsDir = normalizeRelativePath(rawDir ?? DEFAULT_MIGRATION_PATH);
	let migrationsPattern: string;
	if (rawPattern === undefined) {
		migrationsPattern = getDefaultMigrationsPattern(migrationsDir);
	} else {
		migrationsPattern = normalizeRelativePath(rawPattern);
		try {
			stripDirPrefix(migrationsPattern, migrationsDir);
		} catch {
			const suggestedPattern = getDefaultMigrationsPattern(migrationsDir);
			throw new MigrationsConfigError(
				`migrationsPattern must start with ${JSON.stringify(`${migrationsDir}/`)}.`,
				"MIGRATIONS_PATTERN_OUTSIDE_DIR",
				{
					migrationsDir,
					migrationsPattern: rawPattern,
					suggestedPattern,
				}
			);
		}
	}

	return {
		projectPath,
		migrationsDir,
		migrationsPattern,
		migrationsTableName,
	};
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

/** Escape a SQLite identifier using double quotes. */
export function escapeIdentifier(id: string): string {
	return `"${id.replace(/"/g, '""')}"`;
}

/** Build the query that creates the D1 migrations tracking table. */
export function getCreateMigrationsTableQuery(migrationsTableName: string) {
	const escapedTableName = escapeIdentifier(migrationsTableName);
	return `CREATE TABLE IF NOT EXISTS ${escapedTableName}(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;
}

/** Build the query that lists applied migrations in application order. */
export function getListAppliedMigrationsQuery(migrationsTableName: string) {
	const escapedTableName = escapeIdentifier(migrationsTableName);
	return `SELECT *
		FROM ${escapedTableName}
		ORDER BY id`;
}

/** Return migration names that have not already been applied. */
export function getUnappliedMigrationNames(
	migrations: string[],
	appliedMigrations: string[]
): string[] {
	const unappliedMigrations: Array<string> = [];

	for (const migration of migrations) {
		if (!appliedMigrations.includes(migration)) {
			unappliedMigrations.push(migration);
		}
	}

	return unappliedMigrations;
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
 * Compare two migration paths by the leading integer of in each path
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
		const cmp = compareSegments(aSegments[i], bSegments[i]);
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

/**
 * Returns migration names matching `migrationsPattern`, as paths relative to
 * `migrationsDir` with forward-slash separators (e.g. `0000_init/migration.sql`).
 *
 * Walk root is `projectPath/migrationsDir`. Each file is matched against
 * `migrationsPattern` interpreted as a glob relative to `projectPath` (i.e.
 * against `${migrationsDir}/${relativePath}`).
 */
export function getMigrationNames(
	migrationsConfig: MigrationsConfig
): Array<string> {
	const walkRoot = path.resolve(
		migrationsConfig.projectPath,
		migrationsConfig.migrationsDir
	);

	// `listFilesRelative` returns paths relative to `walkRoot`, so the
	// matcher must also be `migrationsDir`-relative. The MigrationsConfig
	// invariant guarantees the pattern is under migrationsDir, so this never
	// throws.
	const dirRelativePattern = stripDirPrefix(
		migrationsConfig.migrationsPattern,
		migrationsConfig.migrationsDir
	);
	const matches = listFilesRelative(
		walkRoot,
		new Minimatch(dirRelativePattern, { dot: false })
	);

	return matches;
}

/**
 * Build a query containing a migration and the tracking-table insert that
 * records it as applied.
 */
export function buildMigrationQuery({
	migrationsPath,
	migrationName,
	migrationsTableName,
}: {
	migrationsPath: string;
	migrationName: string;
	migrationsTableName: string;
}) {
	const migration = fs.readFileSync(
		path.join(migrationsPath, migrationName),
		"utf8"
	);
	const escapedTableName = escapeIdentifier(migrationsTableName);
	return `${migration}
INSERT INTO ${escapedTableName} (name)
values ('${migrationName.replace(/'/g, "''")}');`;
}

/**
 * Return a matching Drizzle-style pattern when the configured pattern misses
 * that layout.
 */
export function findDrizzleMigrationsPattern({
	projectPath,
	migrationsDir,
}: Pick<MigrationsConfig, "projectPath" | "migrationsDir">):
	| string
	| undefined {
	const walkRoot = path.resolve(projectPath, migrationsDir);
	const drizzleFiles = listFilesRelative(
		walkRoot,
		new Minimatch("*/migration.sql", { dot: false })
	);
	if (drizzleFiles.length === 0) {
		return undefined;
	}
	const drizzlePattern = normalizeRelativePath(
		`${migrationsDir}/*/migration.sql`
	);
	return drizzlePattern;
}

/**
 * Returns the highest current migration number plus one.
 *
 * Numbers come from the leading integer of each matched migration's first
 * path segment:
 *   - `0001_init.sql`           → 1   (flat layout)
 *   - `0003_init/migration.sql` → 3   (drizzle-style; directory carries the
 *                                      number, and multiple files inside it
 *                                      collapse to that one number)
 *
 * Only files that match `migrationsPattern` participate — a stray top-level
 * `0099_x.sql` is invisible when the pattern only matches
 * `migrations/*\/migration.sql`, because `apply` wouldn't run it either.
 */
export function getNextMigrationNumber(
	migrationsConfig: MigrationsConfig
): number {
	const matchedNames = getMigrationNames(migrationsConfig);
	const migrationNumbers = matchedNames
		.map((name) => leadingMigrationNumber(name))
		// Drop unnumbered migrations (parseInt → NaN) so they don't poison
		// Math.max.
		.filter((n) => Number.isFinite(n));
	return Math.max(...migrationNumbers, 0) + 1;
}
