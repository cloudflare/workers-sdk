import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import {
	compareMigrationPaths,
	getD1MigrationFiles,
} from "../src/d1-migrations";
import { runInTempDir, seed } from "../src/test-helpers";

async function seedProjectFiles(filesRelativeToProject: string[]) {
	const files: Record<string, string> = {};
	for (const file of filesRelativeToProject) {
		files[file] = "-- test migration";
	}
	await seed(files);
}

function namesOf(files: Array<{ name: string; filePath: string }>): string[] {
	return files.map((file) => file.name);
}

describe("getD1MigrationFiles", () => {
	runInTempDir();

	it("returns an empty array for an empty directory", async ({ expect }) => {
		fs.mkdirSync("migrations", { recursive: true });
		const result = getD1MigrationFiles({ projectPath: "." });
		expect(namesOf(result)).toEqual([]);
	});

	it("returns an empty array when the migrations directory is missing", ({
		expect,
	}) => {
		const result = getD1MigrationFiles({ projectPath: "." });
		expect(namesOf(result)).toEqual([]);
	});

	it("returns top-level .sql files sorted by migration number with the default pattern", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/0003_add_indexes.sql",
			"migrations/0001_create_tables.sql",
			"migrations/0002_add_columns.sql",
			"migrations/0005_update_views.sql",
			"migrations/0004_drop_unused.sql",
		]);

		const result = getD1MigrationFiles({ projectPath: "." });

		expect(namesOf(result)).toEqual([
			"0001_create_tables.sql",
			"0002_add_columns.sql",
			"0003_add_indexes.sql",
			"0004_drop_unused.sql",
			"0005_update_views.sql",
		]);
		expect(result[0]?.filePath).toBe(
			path.resolve("migrations/0001_create_tables.sql")
		);
	});

	it("ignores non-SQL files under the default pattern", async ({ expect }) => {
		await seedProjectFiles([
			"migrations/0001_create_tables.sql",
			"migrations/0002_add_columns.sql",
			"migrations/README.md",
			"migrations/config.json",
			"migrations/migration_lock.toml",
		]);

		const result = getD1MigrationFiles({ projectPath: "." });

		expect(namesOf(result)).toEqual([
			"0001_create_tables.sql",
			"0002_add_columns.sql",
		]);
	});

	it("does not pick up nested .sql files with the default pattern", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/0001_create_tables.sql",
			"migrations/test_data/destroy.sql",
		]);

		const result = getD1MigrationFiles({ projectPath: "." });

		expect(namesOf(result)).toEqual(["0001_create_tables.sql"]);
	});

	it("picks up nested .sql files when migrationsPattern is configured", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/0000_init/migration.sql",
			"migrations/0001_users/migration.sql",
		]);

		const result = getD1MigrationFiles({
			projectPath: ".",
			migrationsDir: "migrations",
			migrationsPattern: "migrations/*/migration.sql",
		});

		expect(namesOf(result)).toEqual([
			"0000_init/migration.sql",
			"0001_users/migration.sql",
		]);
		expect(result[0]?.filePath).toBe(
			path.resolve("migrations/0000_init/migration.sql")
		);
	});

	it("matches files by whatever extension migrationsPattern specifies, not just .sql", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/0001_init.up.sql",
			"migrations/0002_users.up.sql",
			"migrations/0099_legacy.sql",
		]);

		const result = getD1MigrationFiles({
			projectPath: ".",
			migrationsDir: "migrations",
			migrationsPattern: "migrations/*.up.sql",
		});

		expect(namesOf(result)).toEqual(["0001_init.up.sql", "0002_users.up.sql"]);
	});

	it("returns names relative to migrationsDir even when the pattern has a literal sub-segment", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/sub/0001_x.sql",
			"migrations/sub/0002_y.sql",
			"migrations/should_be_ignored.sql",
		]);

		const result = getD1MigrationFiles({
			projectPath: ".",
			migrationsDir: "migrations",
			migrationsPattern: "migrations/sub/*.sql",
		});

		expect(namesOf(result)).toEqual(["sub/0001_x.sql", "sub/0002_y.sql"]);
	});

	it("recursively finds .sql files when migrationsPattern uses **", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/0001_top.sql",
			"migrations/feature_a/0002_mid.sql",
			"migrations/feature_b/sub/0003_deep.sql",
		]);

		const result = getD1MigrationFiles({
			projectPath: ".",
			migrationsDir: "migrations",
			migrationsPattern: "migrations/**/*.sql",
		});

		expect(namesOf(result)).toEqual([
			"0001_top.sql",
			"feature_a/0002_mid.sql",
			"feature_b/sub/0003_deep.sql",
		]);
	});

	it("does not descend into subdirectories the configured pattern cannot reach", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/0001_real.sql",
			"migrations/node_modules/some_pkg/0001/migration.sql",
		]);

		const result = getD1MigrationFiles({ projectPath: "." });

		expect(namesOf(result)).toEqual(["0001_real.sql"]);
	});

	it("skips hidden files when matching the default pattern", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/0001_init.sql",
			"migrations/.hidden.sql",
		]);

		const result = getD1MigrationFiles({ projectPath: "." });

		expect(namesOf(result)).toEqual(["0001_init.sql"]);
	});

	it("sorts inconsistently-padded numeric prefixes in numeric order, not lexicographic", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/1_a.sql",
			"migrations/9_b.sql",
			"migrations/10_c.sql",
		]);

		const result = getD1MigrationFiles({ projectPath: "." });

		expect(namesOf(result)).toEqual(["1_a.sql", "9_b.sql", "10_c.sql"]);
	});

	it("puts numbered files before unnumbered files", async ({ expect }) => {
		await seedProjectFiles([
			"migrations/setup.sql",
			"migrations/0002_users.sql",
			"migrations/cleanup.sql",
			"migrations/0001_init.sql",
		]);

		const result = getD1MigrationFiles({ projectPath: "." });

		expect(namesOf(result)).toEqual([
			"0001_init.sql",
			"0002_users.sql",
			"cleanup.sql",
			"setup.sql",
		]);
	});

	it("uses the directory's numeric prefix for nested drizzle-style layouts", async ({
		expect,
	}) => {
		await seedProjectFiles([
			"migrations/10_c/migration.sql",
			"migrations/2_b/migration.sql",
			"migrations/1_a/migration.sql",
		]);

		const result = getD1MigrationFiles({
			projectPath: ".",
			migrationsDir: "migrations",
			migrationsPattern: "migrations/*/migration.sql",
		});

		expect(namesOf(result)).toEqual([
			"1_a/migration.sql",
			"2_b/migration.sql",
			"10_c/migration.sql",
		]);
	});

	it("throws when migrationsPattern is not under migrationsDir", ({
		expect,
	}) => {
		expect(() =>
			getD1MigrationFiles({
				projectPath: ".",
				migrationsDir: "migrations",
				migrationsPattern: "other/*.sql",
			})
		).toThrow(
			'Expected migrations pattern "other/*.sql" to start with "migrations/"'
		);
	});
});

describe("compareMigrationPaths", () => {
	it("orders numbered files inside a shared numbered directory numerically", ({
		expect,
	}) => {
		const unsorted = [
			"0001_posts/10_c.sql",
			"0001_posts/1_a.sql",
			"0001_posts/9_b.sql",
		];

		expect([...unsorted].sort(compareMigrationPaths)).toEqual([
			"0001_posts/1_a.sql",
			"0001_posts/9_b.sql",
			"0001_posts/10_c.sql",
		]);
	});
});
