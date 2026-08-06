import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, vi } from "vitest";
import { readD1Migrations } from "../src/pool/d1";

vi.mock("wrangler", () => ({
	unstable_splitSqlQuery: (sql: string) => [sql.trim()],
}));

const tmpDirs: string[] = [];

afterEach(() => {
	for (const tmpDir of tmpDirs.splice(0)) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

function createMigrationsDir(files: Record<string, string>): string {
	const migrationsPath = fs.mkdtempSync(
		path.join(os.tmpdir(), "d1-migrations-")
	);
	tmpDirs.push(migrationsPath);

	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.join(migrationsPath, ...name.split("/"));
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
	}

	return migrationsPath;
}

describe("readD1Migrations", () => {
	it("reads flat migrations in migration number order", async ({ expect }) => {
		const migrationsPath = createMigrationsDir({
			"10_seed.sql": "CREATE TABLE seed (id INTEGER);",
			"2_add_users.sql": "CREATE TABLE users (id INTEGER);",
		});

		const migrations = await readD1Migrations(migrationsPath);

		expect(migrations).toEqual([
			{
				name: "2_add_users.sql",
				queries: ["CREATE TABLE users (id INTEGER);"],
			},
			{
				name: "10_seed.sql",
				queries: ["CREATE TABLE seed (id INTEGER);"],
			},
		]);
	});

	it("reads nested D1 migrations in migration number order", async ({
		expect,
	}) => {
		const migrationsPath = createMigrationsDir({
			"10_seed/migration.sql": "CREATE TABLE seed (id INTEGER);",
			"2_add_users/migration.sql": "CREATE TABLE users (id INTEGER);",
			"init/migration.sql": "CREATE TABLE init (id INTEGER);",
			"3_ignored/snapshot.json": "{}",
		});

		const migrations = await readD1Migrations(migrationsPath);

		expect(migrations).toEqual([
			{
				name: "2_add_users/migration.sql",
				queries: ["CREATE TABLE users (id INTEGER);"],
			},
			{
				name: "10_seed/migration.sql",
				queries: ["CREATE TABLE seed (id INTEGER);"],
			},
			{
				name: "init/migration.sql",
				queries: ["CREATE TABLE init (id INTEGER);"],
			},
		]);
	});
});
