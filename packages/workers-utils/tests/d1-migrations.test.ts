import fs from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	buildMigrationQuery,
	getCreateMigrationsTableQuery,
	getListAppliedMigrationsQuery,
	MigrationsConfigError,
	resolveMigrationsConfig,
} from "../src/d1-migrations";

function writeMigration(filePath: string, contents = "SELECT 1;"): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, contents);
}

describe("D1 migrations", () => {
	runInTempDir();

	it("resolves defaults independently of Wrangler's database type", ({
		expect,
	}) => {
		expect(
			resolveMigrationsConfig({
				projectPath: "project",
			})
		).toEqual({
			projectPath: "project",
			migrationsDir: "migrations",
			migrationsPattern: "migrations/*.sql",
			migrationsTableName: "d1_migrations",
		});
	});

	it("reports configuration errors without coupling them to a CLI", ({
		expect,
	}) => {
		let caught: unknown;
		try {
			resolveMigrationsConfig({
				projectPath: ".",
				migrationsPattern: "migrations/*.sql",
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(MigrationsConfigError);
		expect((caught as MigrationsConfigError).code).toBe(
			"MIGRATIONS_PATTERN_REQUIRES_DIR"
		);
	});

	it("builds escaped tracking-table queries", ({ expect }) => {
		writeMigration("migrations/0001_user's.sql", "CREATE TABLE users;");
		expect(getCreateMigrationsTableQuery('custom"migrations')).toContain(
			'"custom""migrations"'
		);
		expect(getListAppliedMigrationsQuery('custom"migrations')).toContain(
			'FROM "custom""migrations"'
		);
		expect(
			buildMigrationQuery({
				migrationsPath: "migrations",
				migrationName: "0001_user's.sql",
				migrationsTableName: 'custom"migrations',
			})
		).toBe(`CREATE TABLE users;
INSERT INTO "custom""migrations" (name)
values ('0001_user''s.sql');`);
	});
});
