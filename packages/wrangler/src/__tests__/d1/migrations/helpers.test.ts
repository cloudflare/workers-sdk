import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import {
	getMigrationNames,
	getNextMigrationNumber,
} from "../../../d1/migrations/helpers";
import { runInTempDir } from "../../helpers/run-in-tmp";

describe("getMigrationNames", () => {
	runInTempDir();

	it("should return empty array for empty directory", ({ expect }) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		const result = getMigrationNames(migrationsDir);
		expect(result).toEqual([]);
	});

	it("should return sorted migration files", ({ expect }) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		const files = [
			"0003_add_indexes.sql",
			"0001_create_tables.sql",
			"0002_add_columns.sql",
			"0005_update_views.sql",
			"0004_drop_unused.sql",
		];

		files.forEach((file) => {
			fs.writeFileSync(path.join(migrationsDir, file), "-- test migration");
		});

		const result = getMigrationNames(migrationsDir);

		expect(result).toEqual([
			"0001_create_tables.sql",
			"0002_add_columns.sql",
			"0003_add_indexes.sql",
			"0004_drop_unused.sql",
			"0005_update_views.sql",
		]);
	});

	it("should ignore non-SQL files", ({ expect }) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		fs.writeFileSync(
			path.join(migrationsDir, "0001_create_tables.sql"),
			"-- test"
		);
		fs.writeFileSync(
			path.join(migrationsDir, "0002_add_columns.sql"),
			"-- test"
		);
		fs.writeFileSync(path.join(migrationsDir, "README.md"), "# readme");
		fs.writeFileSync(path.join(migrationsDir, "config.json"), "{}");
		fs.writeFileSync(path.join(migrationsDir, "migration_lock.toml"), "");

		const result = getMigrationNames(migrationsDir);

		expect(result).toEqual(["0001_create_tables.sql", "0002_add_columns.sql"]);
	});

	it("should handle directory with only non-SQL files", ({ expect }) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		fs.writeFileSync(path.join(migrationsDir, "README.md"), "# readme");
		fs.writeFileSync(path.join(migrationsDir, "migration_lock.toml"), "");

		const result = getMigrationNames(migrationsDir);
		expect(result).toEqual([]);
	});

	it("should return sorted nested SQL files as normalized relative paths", ({
		expect,
	}) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(path.join(migrationsDir, "20240501120000_initial"), {
			recursive: true,
		});
		fs.mkdirSync(path.join(migrationsDir, "20240501130000_add_users"), {
			recursive: true,
		});

		fs.writeFileSync(path.join(migrationsDir, "0001_top_level.sql"), "-- test");
		fs.writeFileSync(
			path.join(migrationsDir, "20240501130000_add_users", "migration.sql"),
			"-- test"
		);
		fs.writeFileSync(
			path.join(migrationsDir, "20240501120000_initial", "migration.sql"),
			"-- test"
		);
		fs.writeFileSync(
			path.join(migrationsDir, "20240501120000_initial", "README.md"),
			"# readme"
		);

		const result = getMigrationNames(migrationsDir);

		expect(result).toEqual([
			"0001_top_level.sql",
			"20240501120000_initial/migration.sql",
			"20240501130000_add_users/migration.sql",
		]);
	});

	it("should sort multiple SQL files within a single nested directory", ({
		expect,
	}) => {
		// Drizzle generates one `migration.sql` per dir, but users can author
		// directories with multiple `.sql` files (e.g. `up.sql`, `seed.sql`).
		// Confirm those files are discovered and sorted lexically within the
		// containing directory so the apply order is deterministic.
		const migrationsDir = "./migrations";
		fs.mkdirSync(path.join(migrationsDir, "0001_initial"), {
			recursive: true,
		});

		fs.writeFileSync(
			path.join(migrationsDir, "0001_initial", "20_seed.sql"),
			"-- seed"
		);
		fs.writeFileSync(
			path.join(migrationsDir, "0001_initial", "10_schema.sql"),
			"-- schema"
		);
		fs.writeFileSync(
			path.join(migrationsDir, "0001_initial", "00_extensions.sql"),
			"-- ext"
		);
		// Mix in a non-`.sql` file to confirm it's still filtered out at this
		// nesting level.
		fs.writeFileSync(
			path.join(migrationsDir, "0001_initial", "notes.md"),
			"# notes"
		);

		const result = getMigrationNames(migrationsDir);

		expect(result).toEqual([
			"0001_initial/00_extensions.sql",
			"0001_initial/10_schema.sql",
			"0001_initial/20_seed.sql",
		]);
	});

	it("should discover SQL files in arbitrarily deep nested directories", ({
		expect,
	}) => {
		// Sanity check that the walker recurses deeper than one level — there's
		// no documented requirement to support this, but the implementation
		// recurses unconditionally so this guards against accidental regressions
		// (e.g. someone capping the depth).
		const migrationsDir = "./migrations";
		fs.mkdirSync(path.join(migrationsDir, "0001_a", "nested"), {
			recursive: true,
		});

		fs.writeFileSync(
			path.join(migrationsDir, "0001_a", "nested", "migration.sql"),
			"-- deep"
		);
		fs.writeFileSync(
			path.join(migrationsDir, "0001_a", "migration.sql"),
			"-- shallow"
		);

		const result = getMigrationNames(migrationsDir);

		expect(result).toEqual([
			"0001_a/migration.sql",
			"0001_a/nested/migration.sql",
		]);
	});
});

describe("getNextMigrationNumber", () => {
	runInTempDir();

	it("should return the next number after existing top-level migrations", ({
		expect,
	}) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		fs.writeFileSync(path.join(migrationsDir, "0001_create_tables.sql"), "");
		fs.writeFileSync(path.join(migrationsDir, "0003_add_columns.sql"), "");

		expect(getNextMigrationNumber(migrationsDir)).toBe(4);
	});

	it("should include nested migrations when calculating the next number", ({
		expect,
	}) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(path.join(migrationsDir, "9999_nested"), { recursive: true });

		fs.writeFileSync(path.join(migrationsDir, "0002_top_level.sql"), "");
		fs.writeFileSync(
			path.join(migrationsDir, "9999_nested", "migration.sql"),
			""
		);

		expect(getNextMigrationNumber(migrationsDir)).toBe(10000);
	});

	it("should ignore nonnumeric top-level SQL files", ({ expect }) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		fs.writeFileSync(path.join(migrationsDir, "README.sql"), "");
		fs.writeFileSync(path.join(migrationsDir, "schema.sql"), "");

		expect(getNextMigrationNumber(migrationsDir)).toBe(1);
	});

	it("should continue after nested timestamp migrations", ({ expect }) => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(path.join(migrationsDir, "20240501120000_initial"), {
			recursive: true,
		});

		fs.writeFileSync(
			path.join(migrationsDir, "20240501120000_initial", "migration.sql"),
			""
		);

		expect(getNextMigrationNumber(migrationsDir)).toBe(20240501120001);
	});
});
