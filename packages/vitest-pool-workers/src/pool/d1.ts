import fs from "node:fs";
import path from "node:path";
import type { D1Migration } from "../shared/d1";

type MigrationFile = {
	name: string;
	filePath: string;
};

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
	const migrations = listSqlMigrations(migrationsPath);
	return migrations.map(({ name, filePath }) => {
		const migration = fs.readFileSync(filePath, "utf8");
		const queries = unstable_splitSqlQuery(migration);
		return { name, queries };
	});
}

function listSqlMigrations(migrationsPath: string): MigrationFile[] {
	const migrations: MigrationFile[] = [];
	const stack: Array<{ directoryPath: string; relativePath: string }> = [
		{ directoryPath: migrationsPath, relativePath: "" },
	];

	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) {
			continue;
		}

		const entries = fs.readdirSync(current.directoryPath, {
			withFileTypes: true,
		});
		for (const entry of entries) {
			const entryPath = path.join(current.directoryPath, entry.name);
			const name =
				current.relativePath === ""
					? entry.name
					: `${current.relativePath}/${entry.name}`;

			if (entry.isDirectory()) {
				stack.push({ directoryPath: entryPath, relativePath: name });
			} else if (entry.isFile() && entry.name.endsWith(".sql")) {
				migrations.push({ name, filePath: entryPath });
			}
		}
	}

	return migrations.sort((a, b) => compareMigrationPaths(a.name, b.name));
}

function compareMigrationPaths(a: string, b: string): number {
	const aSegments = a.split("/");
	const bSegments = b.split("/");
	const shared = Math.min(aSegments.length, bSegments.length);
	for (let i = 0; i < shared; i++) {
		const cmp = compareSegments(aSegments[i], bSegments[i]);
		if (cmp !== 0) {
			return cmp;
		}
	}
	return aSegments.length - bSegments.length;
}

function compareSegments(a: string, b: string): number {
	const aNum = leadingMigrationNumber(a);
	const bNum = leadingMigrationNumber(b);
	if (aNum !== bNum) {
		if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
			return aNum - bNum;
		}
		if (Number.isFinite(aNum)) {
			return -1;
		}
		if (Number.isFinite(bNum)) {
			return 1;
		}
	}

	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

function leadingMigrationNumber(relativePath: string): number {
	const firstSegment = relativePath.split("/")[0];
	return parseInt(firstSegment.split("_")[0], 10);
}

export type { D1Migration };
