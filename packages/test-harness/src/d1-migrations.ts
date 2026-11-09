// Copied from Wrangler's src/d1/constants.ts and src/d1/migrations/helpers.ts
import fs from "node:fs";
import path from "node:path";
import {
	getD1MigrationFiles,
	normalizeRelativePath,
} from "@cloudflare/workers-utils";

export const DEFAULT_MIGRATION_PATH = "./migrations";
export const DEFAULT_MIGRATION_TABLE = "d1_migrations";

// Copied from cf's src/commands/d1/migrations/bookkeeping.ts, as the options
// are those of `cf d1 migrations apply`, with its flags as option names

/** Fully-resolved view of one invocation's migration inputs. */
export interface MigrationsConfig {
	/** Absolute path of the directory migrations are read from. */
	migrationsPath: string;
	/** Normalized `dir` value, relative to cwd. `"."` means cwd itself. */
	migrationsDir: string;
	/** Normalized `pattern` glob, guaranteed to sit under `migrationsDir`. */
	migrationsPattern: string;
	migrationsTableName: string;
}

/**
 * Rewrite `pattern` relative to `dir` by dropping the `${dir}/` prefix.
 * Both must already be normalized. Throws when `pattern` is not under `dir`.
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
 * Resolve `dir` / `pattern` / `table` into a `MigrationsConfig`,
 * rejecting a pattern that isn't under the directory (it could never match).
 */
export function resolveMigrationsConfig(opts: {
	dir?: string;
	pattern?: string;
	table?: string;
	cwd?: string;
}): MigrationsConfig {
	if (opts.pattern !== undefined && opts.dir === undefined) {
		throw new Error(
			`You have set \`pattern: "${opts.pattern}"\` but have not set \`dir\`.\n\n` +
				'When `pattern` is set, `dir` must also be set, and `pattern` must start with "<dir>/".'
		);
	}

	const migrationsDir = normalizeRelativePath(
		opts.dir ?? DEFAULT_MIGRATION_PATH
	);
	const defaultPattern = normalizeRelativePath(`${migrationsDir}/*.sql`);

	let migrationsPattern: string;
	if (opts.pattern === undefined) {
		migrationsPattern = defaultPattern;
	} else {
		migrationsPattern = normalizeRelativePath(opts.pattern);
		try {
			stripDirPrefix(migrationsPattern, migrationsDir);
		} catch {
			throw new Error(
				`\`pattern: "${opts.pattern}"\` must start with "${migrationsDir}/" to match \`dir: "${migrationsDir}"\`.\n` +
					`Either change \`pattern\` so it starts with "${migrationsDir}/" (for example, "${defaultPattern}"), ` +
					`or change \`dir\` to match the start of your pattern.`
			);
		}
	}

	return {
		migrationsPath: path.resolve(opts.cwd ?? process.cwd(), migrationsDir),
		migrationsDir,
		migrationsPattern,
		migrationsTableName: opts.table ?? DEFAULT_MIGRATION_TABLE,
	};
}

/**
 * When `pattern` matched nothing, returns Drizzle's nested layout if it
 * matches files in the migrations directory.
 */
export function findDrizzleLayoutHint(
	config: MigrationsConfig,
	cwd: string
): string | undefined {
	// Lists files with workers-utils, where cf has its own walker
	const drizzleFiles = getD1MigrationFiles({
		projectPath: cwd,
		migrationsDir: config.migrationsDir,
		migrationsPattern: `${config.migrationsDir}/*/migration.sql`,
	});
	if (drizzleFiles.length === 0) {
		return undefined;
	}
	return normalizeRelativePath(`${config.migrationsDir}/*/migration.sql`);
}

export function escapeIdentifier(id: string): string {
	return `"${id.replace(/"/g, '""')}"`;
}

export function getCreateMigrationsTableQuery(migrationsTableName: string) {
	const escapedTableName = escapeIdentifier(migrationsTableName);
	return `CREATE TABLE IF NOT EXISTS ${escapedTableName}(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;
}

export function getListAppliedMigrationsQuery(migrationsTableName: string) {
	const escapedTableName = escapeIdentifier(migrationsTableName);
	return `SELECT *
		FROM ${escapedTableName}
		ORDER BY id`;
}

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
