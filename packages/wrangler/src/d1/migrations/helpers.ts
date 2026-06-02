import fs from "node:fs";
import path from "node:path";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import { Minimatch } from "minimatch";
import { confirm } from "../../dialogs";
import { isNonInteractiveOrCI } from "../../is-interactive";
import { logger } from "../../logger";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "../constants";
import { executeSql } from "../execute";
import type { QueryResult } from "../execute";
import type { Database, Migration } from "../types";
import type { Config } from "@cloudflare/workers-utils";

function getDefaultMigrationsPattern(migrationsDir: string) {
	return normalizeRelativePath(`${migrationsDir}/*.sql`);
}

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
 *  - `projectPath` is the directory containing the user's Wrangler config —
 *    the base that `migrationsDir` and `migrationsPattern` resolve against.
 *  - `configFile` is the short display name (e.g. `"wrangler.jsonc"`) used
 *    in error messages.
 */
export type MigrationsConfig = {
	projectPath: string;
	configFile: string;
	migrationsDir: string;
	migrationsPattern: string;
	migrationsTableName: string;
	migrationsDirRaw?: string;
};

/**
 * Resolve the migrations-related config for one D1 binding into a
 * `MigrationsConfig`, throwing a `UserError` if `migrations_pattern` is set
 * without `migrations_dir`, or doesn't start with `${migrations_dir}/`.
 *
 * `databaseInfo` may be `null` — `apply --local` and `list --local` pass
 * `null` when the binding can't be found, and fall back to the defaults
 * so the commands surface "no migrations found" instead of crashing.
 */
export function resolveMigrationsConfig({
	databaseInfo,
	configPath,
}: {
	databaseInfo: Database | null;
	configPath: string;
}): MigrationsConfig {
	const configFile = configFileName(configPath);
	const projectPath = path.dirname(configPath);

	const rawDir = databaseInfo?.migrationsDirRaw;
	const rawPattern = databaseInfo?.migrationsPattern;

	if (rawPattern !== undefined && rawDir === undefined) {
		throw new UserError(
			`You have set \`migrations_pattern: "${rawPattern}"\` in your ${configFile} file but have not set \`migrations_dir\` for this D1 binding.\n\n` +
				`When \`migrations_pattern\` is set, \`migrations_dir\` must also be set, and \`migrations_pattern\` must start with \`\${migrations_dir}/\`. Add a \`migrations_dir\` entry to your ${configFile} file (for example, \`"migrations_dir": "migrations"\`).`,
			{
				telemetryMessage:
					"d1 migrations migrations_pattern set without migrations_dir",
			}
		);
	}

	const migrationsDir = normalizeRelativePath(
		databaseInfo?.migrationsDirRaw ?? DEFAULT_MIGRATION_PATH
	);

	let migrationsPattern: string;
	if (rawPattern === undefined) {
		migrationsPattern = getDefaultMigrationsPattern(migrationsDir);
	} else {
		migrationsPattern = normalizeRelativePath(rawPattern);
		try {
			// Called for its throw-on-non-prefix side effect
			stripDirPrefix(migrationsPattern, migrationsDir);
		} catch {
			const suggestedPattern = getDefaultMigrationsPattern(migrationsDir);
			throw new UserError(
				`The configured \`migrations_pattern: "${rawPattern}"\` in your ${configFile} file must start with \`${migrationsDir}/\` to match \`"migrations_dir": "${migrationsDir}"\`.\n\n` +
					`Either change \`migrations_pattern\` so it starts with \`${migrationsDir}/\` (for example, \`"${suggestedPattern}"\`), or change \`migrations_dir\` to match the start of your pattern.`,
				{
					telemetryMessage:
						"d1 migrations migrations_pattern does not start with migrations_dir",
				}
			);
		}
	}

	const migrationsTableName =
		databaseInfo?.migrationsTableName ?? DEFAULT_MIGRATION_TABLE;

	return {
		projectPath,
		configFile,
		migrationsDir,
		migrationsPattern,
		migrationsTableName,
		migrationsDirRaw: rawDir,
	};
}

/**
 * Normalize a relative path or glob into a canonical form for string-prefix
 * comparisons:
 *
 *  - Backslashes flipped to forward slashes.
 *  - Leading `./` and `//` runs collapsed (via `path.posix.normalize`).
 *  - Trailing `/` stripped (`normalize("foo/")` keeps it; we don't want it).
 */
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

export function normalizeRelativePath(p: string): string {
	const forwardSlashed = p.replace(/\\/g, "/");
	const normalized = path.posix.normalize(forwardSlashed);
	if (normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}
	return normalized;
}

export async function getMigrationsPath({
	projectPath,
	migrationsDir,
	migrationsDirRaw,
	createIfMissing,
	configPath,
}: {
	projectPath: string;
	migrationsDir: string;
	migrationsDirRaw: string | undefined;
	createIfMissing: boolean;
	configPath: string | undefined;
}): Promise<string> {
	const dir = path.resolve(projectPath, migrationsDir);
	if (fs.existsSync(dir)) {
		return dir;
	}

	const warning = `No migrations folder found.${
		migrationsDirRaw === undefined
			? ` Set \`migrations_dir\` in your ${configFileName(configPath)} file to choose a different path.`
			: ""
	}`;

	if (createIfMissing && (await confirm(`${warning}\nOk to create ${dir}?`))) {
		fs.mkdirSync(dir, { recursive: true });
		return dir;
	} else {
		logger.warn(warning);
	}

	throw new UserError(`No migrations present at ${dir}.`, {
		telemetryMessage: "d1 migrations missing migrations directory",
	});
}

export async function getUnappliedMigrations({
	migrationsConfig,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: {
	migrationsConfig: MigrationsConfig;
	local: boolean | undefined;
	remote: boolean | undefined;
	config: Config;
	name: string;
	persistTo: string | undefined;
	preview: boolean | undefined;
}): Promise<Array<string>> {
	const appliedMigrations = (
		await listAppliedMigrations({
			migrationsTableName: migrationsConfig.migrationsTableName,
			local,
			remote,
			config,
			name,
			persistTo,
			preview,
		})
	).map((migration) => {
		return migration.name;
	});
	const projectMigrations = getMigrationNames(migrationsConfig);
	if (projectMigrations.length === 0) {
		maybeLogHint(migrationsConfig);
	}

	const unappliedMigrations: Array<string> = [];

	for (const migration of projectMigrations) {
		if (!appliedMigrations.includes(migration)) {
			unappliedMigrations.push(migration);
		}
	}

	return unappliedMigrations;
}

type ListAppliedMigrationsProps = {
	migrationsTableName: string;
	local: boolean | undefined;
	remote: boolean | undefined;
	config: Config;
	name: string;
	persistTo: string | undefined;
	preview: boolean | undefined;
};

const listAppliedMigrations = async ({
	migrationsTableName,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: ListAppliedMigrationsProps): Promise<Migration[]> => {
	const response: QueryResult[] | null = await executeSql({
		local,
		remote,
		config,
		name,
		shouldPrompt: !isNonInteractiveOrCI(),
		persistTo,
		command: `SELECT *
		FROM ${migrationsTableName}
		ORDER BY id`,
		file: undefined,
		json: true,
		preview,
	});

	if (!response || response[0].results.length === 0) {
		return [];
	}

	return response[0].results as Migration[];
};

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
 *
 * If no files match but `*\/migration.sql` (drizzle's layout) matches files
 * on disk, logs a hint to stderr suggesting that pattern.
 */
export function getMigrationNames({
	projectPath,
	migrationsDir,
	migrationsPattern,
}: MigrationsConfig): Array<string> {
	const walkRoot = path.resolve(projectPath, migrationsDir);

	// `listFilesRelative` returns paths relative to `walkRoot`, so the
	// matcher must also be `migrationsDir`-relative. The MigrationsConfig
	// invariant guarantees the pattern is under migrationsDir, so this never
	// throws.
	const dirRelativePattern = stripDirPrefix(migrationsPattern, migrationsDir);
	const matches = listFilesRelative(
		walkRoot,
		new Minimatch(dirRelativePattern, { dot: false })
	);

	return matches;
}

/**
 * If the configured `migrations_pattern` found nothing but `*\/migration.sql`
 * (drizzle's layout) matches files under `migrations_dir`, point the user
 * at the right pattern. Runs its own narrow walk — only called in the
 * no-matches branch.
 */
export function maybeLogHint({
	projectPath,
	migrationsDir,
	migrationsPattern,
	configFile,
}: Pick<
	MigrationsConfig,
	"projectPath" | "migrationsDir" | "migrationsPattern" | "configFile"
>) {
	const walkRoot = path.resolve(projectPath, migrationsDir);
	const drizzleFiles = listFilesRelative(
		walkRoot,
		new Minimatch("*/migration.sql", { dot: false })
	);
	if (drizzleFiles.length === 0) {
		return;
	}
	const drizzlePattern = normalizeRelativePath(
		`${migrationsDir}/*/migration.sql`
	);
	logger.warn(
		`Could not find any migration files matching \`${migrationsPattern}\`. It looks like there are migration files matching \`${drizzlePattern}\` though. If you are using drizzle to manage your migrations, please set \`migrations_pattern\` to \`${drizzlePattern}\` in ${configFile}.`
	);
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

export const initMigrationsTable = async ({
	migrationsTableName,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: {
	migrationsTableName: string;
	local: boolean | undefined;
	remote: boolean | undefined;
	config: Config;
	name: string;
	persistTo: string | undefined;
	preview: boolean | undefined;
}) => {
	return executeSql({
		local,
		remote,
		config,
		name,
		shouldPrompt: !isNonInteractiveOrCI(),
		persistTo,
		command: `CREATE TABLE IF NOT EXISTS ${migrationsTableName}(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`,
		file: undefined,
		json: true,
		preview,
	});
};
