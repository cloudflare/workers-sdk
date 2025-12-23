import * as fs from "node:fs";
import * as path from "node:path";
import { getMigrationNames } from "../../../d1/migrations/helpers";
import { runInTempDir } from "../../helpers/run-in-tmp";

describe("getMigrationNames", () => {
	runInTempDir();

	it("should return empty array for empty directory", () => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		const result = getMigrationNames(migrationsDir);
		expect(result).toEqual([]);
	});

	it("should return sorted migration files", () => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		const files = [
			"migration_20250722141901.sql",
			"migration_20250529155016.sql",
			"migration_20250606164215.sql",
			"migration_20250730071719.sql",
			"migration_20250610140315.sql",
		];

		files.forEach((file) => {
			fs.writeFileSync(path.join(migrationsDir, file), "-- test migration");
		});

		const result = getMigrationNames(migrationsDir);

		expect(result).toEqual([
			"migration_20250529155016.sql",
			"migration_20250606164215.sql",
			"migration_20250610140315.sql",
			"migration_20250722141901.sql",
			"migration_20250730071719.sql",
		]);
	});

	it("should ignore non-SQL files", () => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		fs.writeFileSync(
			path.join(migrationsDir, "migration_20250529155016.sql"),
			"-- test"
		);
		fs.writeFileSync(
			path.join(migrationsDir, "migration_20250606164215.sql"),
			"-- test"
		);
		fs.writeFileSync(path.join(migrationsDir, "README.md"), "# readme");
		fs.writeFileSync(path.join(migrationsDir, "config.json"), "{}");
		fs.writeFileSync(path.join(migrationsDir, "migration_lock.toml"), "");

		const result = getMigrationNames(migrationsDir);

		expect(result).toEqual([
			"migration_20250529155016.sql",
			"migration_20250606164215.sql",
		]);
	});

	it("should handle directory with only non-SQL files", () => {
		const migrationsDir = "./migrations";
		fs.mkdirSync(migrationsDir, { recursive: true });

		fs.writeFileSync(path.join(migrationsDir, "README.md"), "# readme");
		fs.writeFileSync(path.join(migrationsDir, "migration_lock.toml"), "");

		const result = getMigrationNames(migrationsDir);
		expect(result).toEqual([]);
	});
});
