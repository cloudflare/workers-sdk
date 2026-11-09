// Copied from Wrangler's src/d1/constants.ts and src/d1/migrations/helpers.ts
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MIGRATION_PATH = "./migrations";
export const DEFAULT_MIGRATION_TABLE = "d1_migrations";

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
