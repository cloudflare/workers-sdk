import fs from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	buildMigrationQuery,
	createMigration,
	CreateMigrationError,
	getCreateMigrationsTableQuery,
	getListAppliedMigrationsQuery,
	MigrationsConfigError,
	resolveMigrationsConfig,
} from "../src/d1-migrations";
import type { MigrationsConfig } from "../src/d1-migrations";

function migrationsConfig(
	overrides: Partial<MigrationsConfig> = {}
): MigrationsConfig {
	return {
		projectPath: ".",
		migrationsDir: "migrations",
		migrationsPattern: "migrations/*.sql",
		migrationsTableName: "d1_migrations",
		...overrides,
	};
}

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

	it("creates the next migration and its directory", ({ expect }) => {
		const created = createMigration(
			migrationsConfig(),
			"add posts",
			new Date("2026-08-27T12:00:00.000Z")
		);
		expect(created).toEqual({
			name: "0001_add_posts.sql",
			path: path.resolve("migrations/0001_add_posts.sql"),
		});
		expect(fs.readFileSync(created.path, "utf8")).toBe(
			"-- Migration number: 0001 \t 2026-08-27T12:00:00.000Z\n"
		);
	});

	it("reports invalid migration names without writing files", ({ expect }) => {
		let caught: unknown;
		try {
			createMigration(migrationsConfig(), "nested/name");
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(CreateMigrationError);
		expect((caught as CreateMigrationError).code).toBe(
			"MIGRATION_NAME_CONTAINS_PATH_SEPARATOR"
		);
		expect(fs.existsSync("migrations")).toBe(false);
	});

	it("rejects a migration the configured pattern would miss", ({ expect }) => {
		expect(() =>
			createMigration(
				migrationsConfig({
					migrationsPattern: "migrations/*/migration.sql",
				}),
				"add posts"
			)
		).toThrow(
			expect.objectContaining({
				code: "MIGRATION_NAME_DOES_NOT_MATCH_PATTERN",
			})
		);
		expect(fs.existsSync("migrations")).toBe(false);
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
