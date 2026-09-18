import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { readD1Migrations } from "../src/pool/d1";

vi.mock("wrangler", () => ({
	unstable_splitSqlQuery: (sql: string) => [sql.trim()],
}));

describe("readD1Migrations", () => {
	runInTempDir();

	it("reads flat migrations in migration number order", async ({ expect }) => {
		await seed({
			"migrations/10_seed.sql": "CREATE TABLE seed (id INTEGER);",
			"migrations/2_add_users.sql": "CREATE TABLE users (id INTEGER);",
		});

		const migrations = await readD1Migrations(path.resolve("migrations"));

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

	it("does not read nested sql files when given a directory path", async ({
		expect,
	}) => {
		await seed({
			"migrations/0001_init.sql": "CREATE TABLE init (id INTEGER);",
			"migrations/0002_users/migration.sql": "CREATE TABLE users (id INTEGER);",
		});

		const migrations = await readD1Migrations(path.resolve("migrations"));

		expect(migrations).toEqual([
			{
				name: "0001_init.sql",
				queries: ["CREATE TABLE init (id INTEGER);"],
			},
		]);
	});

	it("reads nested D1 migrations when migrationsPattern is set", async ({
		expect,
	}) => {
		await seed({
			"drizzle/10_seed/migration.sql": "CREATE TABLE seed (id INTEGER);",
			"drizzle/2_add_users/migration.sql": "CREATE TABLE users (id INTEGER);",
			"drizzle/init/migration.sql": "CREATE TABLE init (id INTEGER);",
			"drizzle/3_ignored/snapshot.json": "{}",
		});

		const migrations = await readD1Migrations({
			projectPath: process.cwd(),
			migrationsDir: "drizzle",
			migrationsPattern: "drizzle/*/migration.sql",
		});

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

	it("throws a TypeError when the argument is not a string or options object", async ({
		expect,
	}) => {
		await expect(
			readD1Migrations(
				// @ts-expect-error testing runtime validation
				1
			)
		).rejects.toThrow(
			new TypeError(
				"Failed to execute 'readD1Migrations': parameter 1 is not of type 'string'."
			)
		);
	});

	it("throws when the migrations directory does not exist", async ({
		expect,
	}) => {
		await expect(
			readD1Migrations(path.resolve("missing-migrations"))
		).rejects.toThrow();
	});
});
