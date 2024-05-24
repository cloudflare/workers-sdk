import fs from "node:fs";
import path from "node:path";
import type { D1Migration } from "../shared/d1";

/**
 * Reads all migrations in `migrationsPath`, ordered by migration number.
 * Each migration will have its contents split into an array of SQL queries.
 */
export async function readD1Migrations(
	migrationsPath: string
): Promise<D1Migration[]> {
	// noinspection SuspiciousTypeOfGuard
	if (typeof migrationsPath !== "string") {
		throw new TypeError(
			"Failed to execute 'readD1Migrations': parameter 1 is not of type 'string'."
		);
	}

	const { unstable_splitSqlQuery } = await import("wrangler"); // (lazy)
	const names = fs
		.readdirSync(migrationsPath)
		.filter((name) => name.endsWith(".sql"));
	names.sort((a, b) => {
		const aNumber = parseInt(a.split("_")[0]);
		const bNumber = parseInt(b.split("_")[0]);
		return aNumber - bNumber;
	});
	return names.map((name) => {
		const migrationPath = path.join(migrationsPath, name);
		const migration = fs.readFileSync(migrationPath, "utf8");
		const queries = unstable_splitSqlQuery(migration);
		return { name, queries };
	});
}

export type { D1Migration };
