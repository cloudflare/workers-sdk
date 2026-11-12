// No Node.js imports here: this module also runs inside workerd.
import type { D1Database } from "@cloudflare/workers-types/experimental";

// Can't use an `interface` here as we expect this type to be passed via
// Miniflare's `bindings` option, which requires all values to be JSON-typed.
export type D1Migration = {
	name: string;
	queries: string[];
};

/**
 * Default name of the table that records applied migrations. Wrangler and cf
 * use the same table, so a project can switch between tools.
 */
export const DEFAULT_D1_MIGRATIONS_TABLE = "d1_migrations";

function escapeId(id: string): string {
	return `"${id.replace(/"/g, '""')}"`;
}

/**
 * Returns the query that creates the migrations table if it doesn't exist.
 *
 * @param migrationsTableName Name of the migrations table.
 * @returns The `CREATE TABLE IF NOT EXISTS` query.
 */
export function getCreateD1MigrationsTableQuery(
	migrationsTableName: string
): string {
	return `CREATE TABLE IF NOT EXISTS ${escapeId(migrationsTableName)} (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
	);`;
}

// Checks methods, not `constructor.name`, so Miniflare's Node.js proxy for a
// D1 binding (from `getD1Database()`) is accepted too.
function isD1Database(v: unknown): v is D1Database {
	return (
		typeof v === "object" &&
		v !== null &&
		"prepare" in v &&
		typeof v.prepare === "function" &&
		"batch" in v &&
		typeof v.batch === "function" &&
		"exec" in v &&
		typeof v.exec === "function"
	);
}

function isD1Migration(v: unknown): v is D1Migration {
	return (
		typeof v === "object" &&
		v !== null &&
		"name" in v &&
		typeof v.name === "string" &&
		"queries" in v &&
		Array.isArray(v.queries) &&
		v.queries.every((query) => typeof query === "string")
	);
}
function isD1Migrations(v: unknown): v is D1Migration[] {
	return Array.isArray(v) && v.every(isD1Migration);
}

/**
 * Applies the `migrations` that haven't been applied to `db` yet, recording
 * each one in the migrations table.
 *
 * @param db Database to apply the migrations to.
 * @param migrations Migrations in the order to apply them, for example from
 * `readD1Migrations()`.
 * @param migrationsTableName Table that records applied migrations. Defaults
 * to {@link DEFAULT_D1_MIGRATIONS_TABLE}.
 */
export async function applyD1Migrations(
	db: D1Database,
	migrations: D1Migration[],
	migrationsTableName = DEFAULT_D1_MIGRATIONS_TABLE
) {
	if (!isD1Database(db)) {
		throw new TypeError(
			"Failed to execute 'applyD1Migrations': parameter 1 is not of type 'D1Database'."
		);
	}
	if (!isD1Migrations(migrations)) {
		throw new TypeError(
			"Failed to execute 'applyD1Migrations': parameter 2 is not of type 'D1Migration[]'."
		);
	}
	// noinspection SuspiciousTypeOfGuard
	if (typeof migrationsTableName !== "string") {
		throw new TypeError(
			"Failed to execute 'applyD1Migrations': parameter 3 is not of type 'string'."
		);
	}

	const escapedTableName = escapeId(migrationsTableName);

	await db.prepare(getCreateD1MigrationsTableQuery(migrationsTableName)).run();

	// Find applied migrations
	const appliedMigrationNamesResult = await db
		.prepare(`SELECT name FROM ${escapedTableName};`)
		.all<{ name: string }>();
	const appliedMigrationNames = appliedMigrationNamesResult.results.map(
		({ name }) => name
	);

	// Apply un-applied migrations
	const insertMigrationStmt = db.prepare(
		`INSERT INTO ${escapedTableName} (name) VALUES (?);`
	);
	for (const migration of migrations) {
		if (appliedMigrationNames.includes(migration.name)) {
			continue;
		}

		const queries = migration.queries.map((query) => db.prepare(query));
		queries.push(insertMigrationStmt.bind(migration.name));
		await db.batch(queries);
	}
}
