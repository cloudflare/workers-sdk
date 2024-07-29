import type { D1Migration } from "../shared/d1";

function isD1Database(v: unknown): v is D1Database {
	return (
		typeof v === "object" &&
		v !== null &&
		v.constructor.name === "D1Database" &&
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

export async function applyD1Migrations(
	db: D1Database,
	migrations: D1Migration[],
	migrationsTableName = "d1_migrations"
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

	// Create migrations table if it doesn't exist
	const schema = `CREATE TABLE IF NOT EXISTS ${migrationsTableName} (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
	);`;
	await db.prepare(schema).run();

	// Find applied migrations
	const appliedMigrationNamesResult = await db
		.prepare(`SELECT name FROM ${migrationsTableName};`)
		.all<{ name: string }>();
	const appliedMigrationNames = appliedMigrationNamesResult.results.map(
		({ name }) => name
	);

	// Apply un-applied migrations
	const insertMigrationStmt = db.prepare(
		`INSERT INTO ${migrationsTableName} (name) VALUES (?);`
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
