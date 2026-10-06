import fs from "node:fs";
import { getD1MigrationFiles } from "@cloudflare/workers-utils";
import type { D1Migration } from "../shared/d1";

export type ReadD1MigrationsOptions = {
	projectPath?: string;
	migrationsDir?: string;
	migrationsPattern?: string;
};

/**
 * Reads D1 migration files, ordered by migration number. Each migration has
 * its contents split into an array of SQL queries.
 *
 * Pass a directory path to keep the historical behaviour of reading top-level
 * `*.sql` files in that directory. Pass options to discover files the same way
 * Wrangler does, including nested layouts such as
 * `0001_init/migration.sql` via `migrationsPattern`.
 */
export async function readD1Migrations(
	migrationsPathOrOptions: string | ReadD1MigrationsOptions
): Promise<D1Migration[]> {
	const files = listD1MigrationFiles(migrationsPathOrOptions);
	const { unstable_splitSqlQuery } = await import("wrangler"); // (lazy)
	return files.map(({ name, filePath }) => {
		const migration = fs.readFileSync(filePath, "utf8");
		const queries = unstable_splitSqlQuery(migration);
		return { name, queries };
	});
}

function listD1MigrationFiles(
	migrationsPathOrOptions: string | ReadD1MigrationsOptions
) {
	if (typeof migrationsPathOrOptions === "string") {
		// Preserve the historical error when the path is missing or not a directory.
		fs.readdirSync(migrationsPathOrOptions);
		return getD1MigrationFiles({
			projectPath: migrationsPathOrOptions,
			migrationsDir: ".",
			migrationsPattern: "*.sql",
		});
	}

	if (
		migrationsPathOrOptions !== null &&
		typeof migrationsPathOrOptions === "object"
	) {
		return getD1MigrationFiles({
			projectPath: migrationsPathOrOptions.projectPath ?? process.cwd(),
			migrationsDir: migrationsPathOrOptions.migrationsDir,
			migrationsPattern: migrationsPathOrOptions.migrationsPattern,
		});
	}

	throw new TypeError(
		"Failed to execute 'readD1Migrations': parameter 1 is not of type 'string' or 'object'."
	);
}

export type { D1Migration };
